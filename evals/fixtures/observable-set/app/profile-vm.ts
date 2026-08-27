import { fromObject } from '@nativescript/core'

// View model for the profile page.
// BUG 1: after addTag() runs, the tags Label bound to {{ tags }} never updates.
// BUG 2: code elsewhere reads `vm.displayName` and always gets null, while
//        vm.get('displayName') returns the right value.
export function createProfileVm() {
  const vm = fromObject({ tags: [] as string[] })

  ;(vm as any).addTag = (tag: string) => {
    const tags = vm.get('tags') as string[]
    tags.push(tag)
    vm.set('tags', tags)
  }

  vm.set('displayName', 'Ada Lovelace')
  return vm
}
