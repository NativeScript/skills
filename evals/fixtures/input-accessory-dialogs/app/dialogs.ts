import { Frame, View } from '@nativescript/core'

// Central dialog presenter: every sheet in the app goes through openSheet so
// presentation behavior stays consistent.
let sheetOpen = false

export function isSheetOpen(): boolean {
  return sheetOpen
}

export function openSheet(moduleName: string, context?: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    if (sheetOpen) {
      resolve(undefined)
      return
    }
    sheetOpen = true
    const host = <View>Frame.topmost().currentPage.content
    host.showModal(moduleName, {
      context,
      animated: true,
      fullscreen: false,
      ios: { presentationStyle: UIModalPresentationStyle.PageSheet },
      closeCallback: (result?: unknown) => {
        sheetOpen = false
        resolve(result)
      },
    })
  })
}
