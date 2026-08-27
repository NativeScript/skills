import { EventData, Observable, Page, View } from '@nativescript/core'

export function navigatingTo(args: EventData) {
  const page = <Page>args.object
  const vm = new Observable()
  vm.set('onOpenSettings', () => {
    const view = <View>page.getViewById('root') || page.content
    view.showModal('settings-modal', {
      context: {},
      closeCallback: () => {},
      fullscreen: true,
      animated: true,
    })
  })
  page.bindingContext = vm
}
