import { EventData, Label, Page } from '@nativescript/core'
import { createProfileVm } from './profile-vm'

export function navigatingTo(args: EventData) {
  const page = <Page>args.object
  page.bindingContext = createProfileVm()

  // BUG 3: the confetti animation is supposed to run only on the FIRST tap of
  // the celebrate label, but it runs on every tap.
  const celebrate = <Label>page.getViewById('celebrate')
  celebrate.once('tap', () => {
    console.log('confetti!')
  })
}
