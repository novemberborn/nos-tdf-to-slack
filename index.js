'use strict'

const jsdom = require('jsdom')
const slack = require('slack-notify')(process.env.NOS_TDF_SLACK_WEBHOOK_URL)

let pathname = null
let before = null

let polling = false

function pollCoverage () {
  jsdom.env('http://nos.nl/tour/live', function (err, window) {
    if (err) {
      process.nextTick(function () { throw err })
      return
    }

    const elem = window.document.querySelectorAll('[data-liveblog-url]')[0]
    pathname = elem.getAttribute('data-liveblog-url')
    before = elem.getAttribute('data-liveblog-end')

    console.log(`${before} <${pathname}>`)

    if (!polling) {
      polling = true
      setInterval(pollCoverage, 60 * 60 * 1000)
      pollUpdates()
    }
  })
}

function pollUpdates () {
  jsdom.env(`http://nos.nl${pathname}?before=${before}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  }, function (err, window) {
    if (err) {
      process.nextTick(function () { throw err })
      return
    }

    [].forEach.call(window.document.querySelectorAll('li'), function (item) {
      const title = item.querySelectorAll('h2')[0].textContent
      const body = [].reduce.call(item.querySelectorAll('.liveblog__elements > *'), function (lines, node) {
        const text = node.textContent.trim().split(/\n+/).map(function (str) { return str.trim() }).join('\n')
        if (text) {
          lines.push(text)
        }
        return lines
      }, [])

      slack.alert({
        channel: '#tdf',
        username: 'NOS Live',
        text: `*${title}*

${body.join('\n')}`
      })

      before = item.getAttribute('id')
    })

    console.log(before)
    window.close()
    setTimeout(pollUpdates, 60 * 1000)
  })
}

slack.onError = function (err) {
  process.nextTick(function () { throw err })
}

pollCoverage()
