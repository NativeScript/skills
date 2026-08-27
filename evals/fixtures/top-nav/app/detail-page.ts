import { EventData, Frame, Observable, Page } from '@nativescript/core'

export function navigatingTo(args: EventData) {
  const page = <Page>args.object
  const vm = new Observable()
  vm.set('title', 'Checklist')
  vm.set('onBack', () => Frame.topmost().goBack())
  vm.set('onShare', () => console.log('share'))
  page.bindingContext = vm
}
