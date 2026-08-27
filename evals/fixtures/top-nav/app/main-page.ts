import { EventData, Frame, Observable, Page } from '@nativescript/core'

export function navigatingTo(args: EventData) {
  const page = <Page>args.object
  const vm = new Observable()
  vm.set('onOpenDetail', () => {
    Frame.topmost().navigate({ moduleName: 'detail-page', context: { id: 'release-checklist' } })
  })
  page.bindingContext = vm
}
