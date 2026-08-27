import { Color, FormattedString, Label, Span } from '@nativescript/core'

// Renders "<count> new items since <day>" with the count bold and blue.
// BUG 1: the blue never applies.
// BUG 2: after showPlain() runs, the label still shows the formatted text.
export function renderStatus(label: Label, count: number, day: string) {
  const fs = new FormattedString()

  const countSpan = new Span()
  countSpan.text = `${count} `
  countSpan.fontWeight = 'bold'
  ;(countSpan as any).foregroundColor = new Color('#2563eb')
  fs.spans.push(countSpan)

  const rest = new Span()
  rest.text = `new items since ${day}`
  fs.spans.push(rest)

  label.formattedText = fs
}

export function showPlain(label: Label, message: string) {
  label.text = message
}
