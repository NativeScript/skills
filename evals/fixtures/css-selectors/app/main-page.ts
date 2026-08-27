import { EventData, Label, Page } from '@nativescript/core'

export function navigatingTo(args: EventData) {
  const page = <Page>args.object
  ;(<any>page.getViewById('rose'))['tags'] = 'my-flower'
  ;(<any>page.getViewById('tulip'))['tags'] = 'flower fresh'
}
