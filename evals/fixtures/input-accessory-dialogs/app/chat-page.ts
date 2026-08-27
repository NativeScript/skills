import { EventData, Page, ScrollView, TextView, View } from '@nativescript/core'
import { InputAccessoryManager } from '@nativescript/input-accessory'
import { openSheet } from './dialogs'

// Chat page with a keyboard-docked composer (@nativescript/input-accessory).
// BUG: opening the filters sheet leaves the composer bar floating ON TOP of
// the sheet on iOS, and after a swipe-down dismiss the bar sometimes stays gone.
let accessory: InputAccessoryManager | null = null
let page: Page | null = null
let scrollView: ScrollView | null = null
let composer: View | null = null
let textView: TextView | null = null

export function navigatingTo(args: EventData) {
  page = <Page>args.object
}

export function loadedScroller(args: EventData) {
  scrollView = <ScrollView>args.object
  trySetup()
}

export function loadedComposer(args: EventData) {
  composer = <View>args.object
  trySetup()
}

export function loadedInput(args: EventData) {
  textView = <TextView>args.object
  trySetup()
}

function trySetup() {
  if (accessory || !page || !scrollView || !composer || !textView) return
  accessory = new InputAccessoryManager()
  accessory.setup({ page, scrollView, inputContainer: composer, textView })
}

export async function openFilters() {
  await openSheet('filters-sheet')
}

export function unloaded() {
  accessory?.cleanup()
  accessory = null
}
