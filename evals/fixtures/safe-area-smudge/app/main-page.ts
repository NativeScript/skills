import { EventData, Observable, Page } from '@nativescript/core'

export function navigatingTo(args: EventData) {
  const page = <Page>args.object
  const vm = new Observable()
  vm.set('onOpen', () => {
    console.log('open item')
  })
  page.bindingContext = vm
}
