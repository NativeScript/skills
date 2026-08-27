import { EventData } from '@nativescript/core'

// PROBLEM (Android only): the analytics dashboard shows fetches for tabs the
// user never opened, sometimes twice, and first paint is slow because the
// Library tab's fetch runs at startup. iOS behaves as expected.
export function onTodayLoaded(args: EventData) {
  fetchFeed('today')
}

export function onLibraryLoaded(args: EventData) {
  fetchFeed('library')
}

export function onProfileLoaded(args: EventData) {
  fetchFeed('profile')
}

function fetchFeed(tab: string) {
  console.log('fetching', tab)
}
