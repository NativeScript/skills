# Frontend frameworks

Flavor-specific integration, one subdirectory per framework. A skill lives here when it only makes sense with that framework's component model, DI, routing or build pipeline.

| Directory | Flavor | Name prefix |
|---|---|---|
| `angular/` | [NativeScript Angular](https://docs.nativescript.org/angular/) | `ns-angular-` |
| `vue/` | [NativeScript-Vue](https://nativescript-vue.org) | `ns-vue-` |
| `react/` | [React NativeScript](https://docs.nativescript.org/react/) | `ns-react-` |
| `svelte/` | [Svelte Native](https://svelte.nativescript.org) | `ns-svelte-` |
| `solid/` | [SolidJS](https://docs.nativescript.org/solid/) | `ns-solid-` |

Patterns that work the same in every flavor (custom views, Properties, native APIs) go in `core/`, `ios/`, `android/`, `device/` or `ui/` — and the flavor skill references them.
