import { NativeScriptConfig } from '@nativescript/core';

export default {
  id: 'org.nativescript.nsappts',
  appPath: 'app',
  appResourcesPath: 'App_Resources',
  discardUncaughtJsExceptions: true,
  ios: {
    uncaughtErrorPolicy: 'throw'
  },
  android: {
    v8Flags: '--expose_gc',
    markingMode: 'none',
    uncaughtErrorPolicy: 'throw'
  }
} as NativeScriptConfig;
