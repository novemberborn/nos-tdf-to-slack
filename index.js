'use strict'

const jsdom = require('jsdom')
const slack = require('slack-notify')(process.env.NOS_TDF_SLACK_WEBHOOK_URL)

let pathname = null
let before = null
let clock = 0

let polling = false

function pollCoverage () {
  jsdom.env('http://nos.nl/tour/live/', (err, window) => {
    if (err) {
      process.nextTick(() => { throw err })
      return
    }

    const elem = window.document.querySelector('[data-liveblog-url]')
    if (elem) {
      pathname = elem.getAttribute('data-liveblog-url')
      before = elem.getAttribute('data-liveblog-end')
      clock++
      setTimeout(pollCoverage, 60 * 60 * 1000)

      console.log(`${before} <${pathname}>`)
    } else {
      pathname = before = null
      clock++
      setTimeout(pollCoverage, 5 * 60 * 1000)

      console.log('No liveblog found')
    }

    if (!polling) {
      polling = true
      pollUpdates()
    }
  })
}

function pollUpdates () {
  if (!pathname) {
    polling = false
    return
  }

  const startClock = clock
  jsdom.env(`http://nos.nl${pathname}?before=${before}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  }, (err, window) => {
    if (err) {
      process.nextTick(() => { throw err })
      return
    }

    for (const item of window.document.querySelectorAll('li')) {
      const { textContent: title } = item.querySelector('h2')

      const elements = Array.from(item.querySelector('.liveblog__elements').childNodes).filter(node => node.nodeType === 1)
      const body = elements.reduce((lines, node) => {
        // Improve text representation of video blocks.
        if (node.classList.contains('block_video')) {
          const captionNode = node.querySelector('.caption_content')
          if (captionNode) {
            // Remove geoblock notices
            tryRemove(captionNode.querySelector('.caption_content__icon-wrap'))
            tryRemove(captionNode.querySelector('.caption-description__geo-content'))
          }

          // Play it safe in case there is no caption…
          const caption = normalizeText(captionNode ? captionNode.textContent : '')
          const { href } = node.querySelector('.video-play__link')
          lines.push(`${caption} ${href}`.trim())
          return lines
        }

        // Improve text representation of image blocks.
        if (node.classList.contains('block_image')) {
          const caption = normalizeText((node.querySelector('.caption_content') || {}).textContent || '')
          const { src } = node.querySelector('img')
          lines.push(`${caption} ${src}`.trim())
          return lines
        }

        // Ensure links are separated by spaces.
        for (const anchor of node.querySelectorAll('a')) {
          anchor.parentNode.insertBefore(window.document.createTextNode(' '), anchor)
        }

        const text = normalizeText(node.textContent)
        if (text) {
          lines.push(text)
        }
        return lines
      }, [])

      slack.alert({
        channel: '#tdf',
        username: 'NOS Live',
        text: `*${title}*\n\n${body.join('\n')}`
      })

      if (startClock === clock) {
        before = item.getAttribute('id')
      }
    }

    console.log(before)
    window.close()
    setTimeout(pollUpdates, 60 * 1000)
  })
}

function normalizeText (text) {
  return text.trim().split(/\n+/).map(str => str.trim()).join('\n')
}

function tryRemove (node) {
  if (node) {
    node.parentNode.removeChild(node)
  }
}

slack.onError = function (err) {
  process.nextTick(() => { throw err })
}

pollCoverage()
