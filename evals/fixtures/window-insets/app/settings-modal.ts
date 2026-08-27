import { EventData, View } from '@nativescript/core'

export function onModalLoaded(args: EventData) {
  // modal root
}

export function onDone(args: EventData) {
  const view = <View>args.object
  view.closeModal()
}
