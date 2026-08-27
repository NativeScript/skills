import { Frame } from '@nativescript/core'

// Called when the user taps a row in the feed to open its detail page.
export function openDetail(id: string) {
  Frame.topmost().navigate({
    moduleName: 'detail-page',
    context: { id },
    transition: { name: 'slideLeft', duration: 220 },
  })
}

// Called once at startup to land the frame on the feed before the user sees anything.
export function bootstrapFeed() {
  Frame.topmost().navigate({
    moduleName: 'main-page',
    transition: { name: 'fade' },
  })
}

// Called when the user signs out; they must not be able to navigate back into the app.
export function logout() {
  Frame.topmost().navigate({
    moduleName: 'login-page',
    transition: { name: 'flipRight' },
  })
}
