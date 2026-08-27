import { EventData, fromObject, Page } from '@nativescript/core'

export function navigatingTo(args: EventData) {
  const page = <Page>args.object
  page.bindingContext = fromObject({
    items: [
      { title: 'a', done: true },
      { title: 'b', done: false },
      { title: 'c', done: true },
    ],
    firstName: 'Ada',
    firstNameSuffix: 'the Countess',
  })
}
