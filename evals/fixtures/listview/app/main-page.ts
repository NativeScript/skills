import { EventData, ItemEventData, Label, ListView, Page } from '@nativescript/core'

const colors = ['red', 'green', 'blue', 'amber', 'violet', 'teal', 'rose', 'cyan', 'lime', 'slate']
const items = Array.from({ length: 500 }, (_, i) => ({
  title: `Item ${i}`,
  color: colors[i % colors.length],
  featured: i % 10 === 0,
}))

export function navigatingTo(args: EventData) {
  const page = <Page>args.object
  const listView = <ListView>page.getViewById('list')
  listView.items = items

  // Scrolling this list janks badly on older devices.
  listView.on(ListView.itemLoadingEvent, (loadArgs: ItemEventData) => {
    const label = new Label()
    label.text = items[loadArgs.index].title
    loadArgs.view = label
    logImpression(loadArgs.index)
  })

  // The featured template never applies — every row renders with the default.
  listView.itemTemplateSelector = (item: { featured: boolean }) => (item.featured ? 'hero' : 'row')
}

function logImpression(index: number) {
  // analytics: fired far too often according to the dashboard
  console.log('impression', index)
}
