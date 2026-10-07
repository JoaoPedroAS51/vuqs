# API reference

Reference for every entry point. For usage guides, see the
[Guide](/guide/getting-started/installation) and
[Modules](/modules/) sections.

## Entry points

| Entry point | Import | Purpose |
| --- | --- | --- |
| `@vuqs/core` | `import { … } from '@vuqs/core'` | The core: codecs, composables, adapters, serializer. |
| `@vuqs/core/adapters/browser-history` | `import { … } from '@vuqs/core/adapters/browser-history'` | The [browser History API adapter](/api/adapters/create-browser-history-adapter). |
| `@vuqs/core/adapters/vue-router` | `import { … } from '@vuqs/core/adapters/vue-router'` | The vue-router adapter. |
| `@vuqs/core/modules` | `import { … } from '@vuqs/core/modules'` | [Composable modules](/modules/) applied with `.use()`. |
| `@vuqs/core/shared` | `import { … } from '@vuqs/core/shared'` | Helpers for [writing your own module](/modules/authoring). |
| `@vuqs/core/adapters/testing` | `import { … } from '@vuqs/core/adapters/testing'` | The [testing](/api/testing/create-testing-adapter) adapter and helpers. |
| `@vuqs/core/testing` | `import { … } from '@vuqs/core/testing'` | Codec bijectivity [test helpers](/api/testing/is-codec-bijective). |
| `@vuqs/core/debug` | `import '@vuqs/core/debug'` | Opt-in console [debug rendering](/guide/debugging/enabling): `enableDebug`/`disableDebug`. |
| `@vuqs/core/debug/console` | `import { … } from '@vuqs/core/debug/console'` | Side-effect-free console/performance reporter factories for framework integrations. |
| `@vuqs/core/debug-protocol` | `import type { … } from '@vuqs/core/debug-protocol'` | Type-only, experimental event protocol for tooling (`DebugEventMap`), governed by `DEBUG_PROTOCOL_VERSION`. |
| `@vuqs/nuxt` | `modules: ['@vuqs/nuxt']` | The [Nuxt module](/nuxt/getting-started): auto-imports and an app-wide adapter. |

## Reference pages

| Area | References |
| --- | --- |
| Composables | [useQueryState](/api/composables/use-query-state), [useQueryStates](/api/composables/use-query-states), [toQueryRefs](/api/composables/to-query-refs), [toQueryRef](/api/composables/to-query-ref) |
| Params and schemas | [queryParam](/api/params/query-param), [queryParam.object](/api/params/query-param-object), [defineQuerySchema](/api/params/define-query-schema), [normalizeQueryStateSchema](/api/params/normalize-query-state-schema) |
| Codecs | [codecs](/api/codecs), [createCodec](/api/codecs/create-codec), [codecs.arrayOf](/api/codecs/array-of), [codecs.literal](/api/codecs/literal), [codecs.numberLiteral](/api/codecs/number-literal), [codecs.enum](/api/codecs/enum), [codecs.json](/api/codecs/json) |
| Adapters | [QueryAdapter](/api/adapters/query-adapter), [createVueRouterAdapter](/api/adapters/create-vue-router-adapter), [provideVueRouterAdapter](/api/adapters/provide-vue-router-adapter), [createBrowserHistoryAdapter](/api/adapters/create-browser-history-adapter), [provideBrowserHistoryAdapter](/api/adapters/provide-browser-history-adapter), [installQueryAdapter](/api/adapters/install-query-adapter), [provideQueryAdapter](/api/adapters/provide-query-adapter), [useQueryAdapter](/api/adapters/use-query-adapter) |
| Modules | [withRuntimeDefaults](/api/modules/with-runtime-defaults), [withContext](/api/modules/with-context), [withActiveParams](/api/modules/with-active-params), [withStorage](/api/modules/with-storage), [createWebStorage](/api/modules/create-web-storage) |
| Module authoring | [defineQueryModule](/api/authoring/define-query-module), [QueryCore](/api/authoring/query-core), [QueryModuleRegistry](/api/authoring/query-module-registry), [QueryHookBus](/api/authoring/query-hook-bus), [QueryPipelineBus](/api/authoring/query-pipeline-bus) |
| Serialization | [createSerializer](/api/serialization/create-serializer), [parseQueryStates](/api/serialization/parse-query-states), [serializeQueryStates](/api/serialization/serialize-query-states), [buildQuery](/api/serialization/build-query), [dropDefaults](/api/serialization/drop-defaults), [getManagedKeys](/api/serialization/get-managed-keys), [omitManagedKeys](/api/serialization/omit-managed-keys), [assertUniquePaths](/api/serialization/assert-unique-paths) |
| Utilities | [getPath](/api/utils/get-path), [setPath](/api/utils/set-path), [deletePath](/api/utils/delete-path), [getQueryString](/api/utils/get-query-string), [getQueryStringArray](/api/utils/get-query-string-array), [structuralEq](/api/utils/structural-eq), [pickBy](/api/utils/pick-by), [omitBy](/api/utils/omit-by), [definedOnly](/api/utils/defined-only), [toReadonlyState](/api/utils/to-readonly-state) |
| Testing | [createTestingAdapter](/api/testing/create-testing-adapter), [withVuqsTestingAdapter](/api/testing/with-vuqs-testing-adapter), [isCodecBijective](/api/testing/is-codec-bijective), [testSerializeThenParse](/api/testing/test-serialize-then-parse), [testParseThenSerialize](/api/testing/test-parse-then-serialize) |
| Debugging | [enableDebug](/api/debugging/enable-debug), [disableDebug](/api/debugging/disable-debug), [addDebugReporter](/api/debugging/add-debug-reporter), [retainDebugHistory](/api/debugging/retain-debug-history), [getDebugChannel](/api/debugging/get-debug-channel), [getDebugSnapshot](/api/debugging/get-debug-snapshot), [isDebugArmed](/api/debugging/is-debug-armed), [createDebugLogger](/api/debugging/create-debug-logger), [createConsoleReporter](/api/debugging/create-console-reporter), [addConsoleDebugReporter](/api/debugging/add-console-debug-reporter), [createPerformanceReporter](/api/debugging/create-performance-reporter), [readStoredConsoleDebugConfig](/api/debugging/read-stored-console-debug-config) |
| Advanced | [createQueryStateEngine](/api/advanced/create-query-state-engine) |
| Shared types | [Query types](/api/types), [debug events](/api/debug-events) |

Module walkthroughs remain in the [Modules guides](/modules/).

## Full export list

### `@vuqs/core`

| Export |
| --- |
| [`useQueryState`](/api/composables/use-query-state) |
| [`useQueryStates`](/api/composables/use-query-states) |
| [`toQueryRef`](/api/composables/to-query-ref) |
| [`toQueryRefs`](/api/composables/to-query-refs) |
| [`installQueryAdapter`](/api/adapters/install-query-adapter) |
| [`provideQueryAdapter`](/api/adapters/provide-query-adapter) |
| [`useQueryAdapter`](/api/adapters/use-query-adapter) |
| [`codecs`](/api/codecs) |
| [`createCodec`](/api/codecs/create-codec) |
| [`queryParam`](/api/params/query-param) |
| [`defineQuerySchema`](/api/params/define-query-schema) |
| [`defineQueryModule`](/api/authoring/define-query-module) |
| [`createSerializer`](/api/serialization/create-serializer) |
| [`parseQueryStates`](/api/serialization/parse-query-states) |
| [`serializeQueryStates`](/api/serialization/serialize-query-states) |
| [`buildQuery`](/api/serialization/build-query) |
| [`dropDefaults`](/api/serialization/drop-defaults) |
| [`getManagedKeys`](/api/serialization/get-managed-keys) |
| [`omitManagedKeys`](/api/serialization/omit-managed-keys) |
| [`normalizeQueryStateSchema`](/api/params/normalize-query-state-schema) |
| [`assertUniquePaths`](/api/serialization/assert-unique-paths) |
| [`getPath`](/api/utils/get-path) |
| [`setPath`](/api/utils/set-path) |
| [`deletePath`](/api/utils/delete-path) |
| [`getQueryString`](/api/utils/get-query-string) |
| [`getQueryStringArray`](/api/utils/get-query-string-array) |
| [`structuralEq`](/api/utils/structural-eq) |
| [`createQueryStateEngine`](/api/advanced/create-query-state-engine) |
| [`addDebugReporter`](/api/debugging/add-debug-reporter) |
| [`retainDebugHistory`](/api/debugging/retain-debug-history) |
| [`getDebugChannel`](/api/debugging/get-debug-channel) |
| [`getDebugSnapshot`](/api/debugging/get-debug-snapshot) |
| [`isDebugArmed`](/api/debugging/is-debug-armed) |
| [`createDebugLogger`](/api/debugging/create-debug-logger) |
| [`DEBUG_PROTOCOL_VERSION`](/api/debug-events) |
| [`Codec`](/api/codecs#codec) |
| [`CodecInput`](/api/codecs/create-codec#codecinput) |
| [`CodecWithDefault`](/api/codecs#codecwithdefault) |
| [`DefinedQueryParam`](/api/params/query-param#definedqueryparam) |
| [`DefinedQueryParamWithDefault`](/api/params/query-param#definedqueryparamwithdefault) |
| [`QueryParamBuilder`](/api/params/query-param#queryparambuilder) |
| [`QueryParamBuilderWithDefault`](/api/params/query-param#queryparambuilderwithdefault) |
| [`QueryParamObjectBuilder`](/api/params/query-param-object#queryparamobjectbuilder) |
| [`QueryParamObjectBuilderWithDefault`](/api/params/query-param-object#queryparamobjectbuilderwithdefault) |
| [`PrefixedQueryParamBuilder`](/api/params/query-param-object#prefixedqueryparambuilder) |
| [`QueryParamTransform`](/api/params/query-param#queryparamtransform) |
| [`QueryStateRef`](/api/composables/use-query-state#querystateref) |
| [`UseQueryStateReturn`](/api/composables/use-query-state#usequerystatereturn) |
| [`QueryComposable`](/api/composables/use-query-states#querycomposable) |
| [`QueryStatesValues`](/api/composables/use-query-states#querystatesvalues) |
| [`QueryStatesActions`](/api/composables/use-query-states#querystatesactions) |
| [`UseQueryStatesOptions`](/api/composables/use-query-states#usequerystatesoptions) |
| [`UseQueryStatesReturn`](/api/composables/use-query-states#usequerystatesreturn) |
| [`QueryRef`](/api/composables/to-query-ref#queryref) |
| [`ToQueryRefs`](/api/composables/to-query-refs#toqueryrefs) |
| [`QueryBinding`](/api/composables/to-query-ref#querybinding) |
| [`QueryBindingSource`](/api/composables/to-query-ref#querybindingsource) |
| [`QueryStateSchema`](/api/types#querystateschema) |
| [`QueryStateSchemaInput`](/api/types#querystateschemainput) |
| [`NormalizeQueryStateSchema`](/api/params/define-query-schema#normalizequerystateschema) |
| [`QueryStateValues`](/api/types#querystatevalues) |
| [`QueryStateWriteValues`](/api/types#querystatewritevalues) |
| [`QueryStateValueOf`](/api/types#querystatevalueof) |
| [`QueryStateValueAt`](/api/types#querystatevalueat) |
| [`QueryStateRefValue`](/api/types#querystaterefvalue) |
| [`QueryCore`](/api/authoring/query-core) |
| [`QueryStatesModule`](/api/authoring/define-query-module#module-types) |
| [`QueryStateModule`](/api/authoring/define-query-module#module-types) |
| [`DefinedQueryModule`](/api/authoring/define-query-module#module-types) |
| [`DefinedQueryStatesModule`](/api/authoring/define-query-module#module-types) |
| [`DefinedQueryStateModule`](/api/authoring/define-query-module#module-types) |
| [`QueryModuleFacade`](/api/authoring/define-query-module#module-types) |
| [`QueryStatesFacadeModule`](/api/authoring/define-query-module#module-types) |
| [`QueryStateFacadeModule`](/api/authoring/define-query-module#module-types) |
| [`QueryFacadeModule`](/api/authoring/define-query-module#module-types) |
| [`QueryModuleRegistry`](/api/authoring/query-module-registry) |
| [`QueryModuleName`](/api/authoring/query-module-registry#type) |
| [`QueryHooks`](/api/authoring/query-hook-bus#queryhooks) |
| [`QueryHookBus`](/api/authoring/query-hook-bus) |
| [`QueryPipeline`](/api/authoring/query-pipeline-bus#querypipeline) |
| [`QueryPipelineBus`](/api/authoring/query-pipeline-bus) |
| [`QueryPipelineStage`](/api/authoring/query-pipeline-bus#querypipelinestage) |
| [`QueryValues`](/api/authoring/query-pipeline-bus#queryvalues) |
| [`Enforce`](/api/authoring/query-pipeline-bus#enforce) |
| [`QueryTransaction`](/api/authoring/query-core#querytransaction) |
| [`QueryTransactionBus`](/api/authoring/query-core#querytransactionbus) |
| [`QueryTransactionObserver`](/api/authoring/query-core#querytransactionobserver) |
| [`QueryTransactionDefaultPolicy`](/api/authoring/query-core#querytransactiondefaultpolicy) |
| [`QueryTransactionOrigin`](/api/authoring/query-core#querytransactionorigin) |
| [`QueryTransactionRequest`](/api/authoring/query-core#querytransactionrequest) |
| [`QueryAdapter`](/api/adapters/query-adapter) |
| [`QueryAdapterDefaultOptions`](/api/adapters/query-adapter#queryadapterdefaultoptions) |
| [`NavigateOptions`](/api/adapters/query-adapter#navigateoptions) |
| [`QueryStateNavigate`](/api/adapters/query-adapter#querystatenavigate) |
| [`ParsedQuery`](/api/types#parsedquery) |
| [`ParsedQueryRaw`](/api/types#parsedqueryraw) |
| [`ParsedQueryValue`](/api/types#parsedqueryvalue) |
| [`Serializer`](/api/serialization/create-serializer#serializer) |
| [`CreateSerializerOptions`](/api/serialization/create-serializer#createserializeroptions) |
| [`SerializerStringify`](/api/serialization/create-serializer#serializerstringify) |
| [`SerializerParse`](/api/serialization/create-serializer#serializerparse) |
| [`QueryStateEngine`](/api/advanced/create-query-state-engine#querystateengine) |
| [`QueryStateEngineOptions`](/api/advanced/create-query-state-engine#querystateengineoptions) |
| [`QueryStateReads`](/api/advanced/create-query-state-engine#querystatereads) |
| [`QueryDefaultsBus`](/api/advanced/create-query-state-engine#querydefaultsbus) |
| [`ResolvedQueryStateOptions`](/api/advanced/create-query-state-engine#resolvedquerystateoptions) |
| [`DebugEvent`](/api/debug-events#event-shape) |
| [`DebugContext`](/api/debug-events#event-shape) |
| [`DebugEmissionContext`](/api/debug-events#debugemissioncontext) |
| [`DebugLevel`](/api/debug-events#event-shape) |
| [`Reporter`](/api/debugging/add-debug-reporter#reporter) |
| [`DebugChannelHandle`](/api/debugging/get-debug-channel#debugchannelhandle) |
| [`AddReporterOptions`](/api/debugging/add-debug-reporter#addreporteroptions) |
| [`RetainHistoryOptions`](/api/debugging/retain-debug-history#retainhistoryoptions) |
| [`DebugSnapshot`](/api/debugging/get-debug-snapshot#debugsnapshot) |
| [`DebugSnapshotKind`](/api/debugging/get-debug-snapshot#debugsnapshotkind) |
| [`DebugLogger`](/api/debugging/create-debug-logger#debuglogger) |

### `@vuqs/core/debug`

| Export |
| --- |
| [`enableDebug`](/api/debugging/enable-debug) |
| [`disableDebug`](/api/debugging/disable-debug) |
| [`addConsoleDebugReporter`](/api/debugging/add-console-debug-reporter) |
| [`createConsoleReporter`](/api/debugging/create-console-reporter) |
| [`createPerformanceReporter`](/api/debugging/create-performance-reporter) |
| [`readStoredConsoleDebugConfig`](/api/debugging/read-stored-console-debug-config) |
| [`VUQS_DEBUG_CONFIG_VERSION`](/api/debugging/read-stored-console-debug-config) |
| [`VUQS_DEBUG_STORAGE_KEY`](/api/debugging/read-stored-console-debug-config) |
| [`EnableDebugOptions`](/api/debugging/enable-debug#enabledebugoptions) |
| [`AddConsoleDebugReporterOptions`](/api/debugging/add-console-debug-reporter#addconsoledebugreporteroptions) |
| [`ConsoleReporterOptions`](/api/debugging/create-console-reporter#consolereporteroptions) |
| [`ConsoleDebugPreset`](/api/debugging/create-console-reporter#consoledebugpreset) |
| [`DebugEventFilter`](/api/debugging/create-console-reporter#debugeventfilter) |
| [`DebugEventSelector`](/api/debugging/create-console-reporter#debugeventselector) |
| [`DebugPayloadMode`](/api/debugging/create-console-reporter#debugpayloadmode) |
| [`PerformanceDebugReporter`](/api/debugging/create-performance-reporter#performancedebugreporter) |
| [`PerformanceReporterOptions`](/api/debugging/create-performance-reporter#performancereporteroptions) |
| [`StoredDebugConfigV1`](/api/debugging/read-stored-console-debug-config#storeddebugconfigv1) |
| [`StoredConsoleDebugConfig`](/api/debugging/read-stored-console-debug-config#storedconsoledebugconfig) |
| [`StoredConsoleDebugResolution`](/api/debugging/read-stored-console-debug-config#storedconsoledebugresolution) |
| [`StoredConsoleReporterOptions`](/api/debugging/read-stored-console-debug-config#storedconsolereporteroptions) |
| [`StoredDebugEventFilter`](/api/debugging/read-stored-console-debug-config#storeddebugeventfilter) |
| [`StoredDebugEventSelector`](/api/debugging/read-stored-console-debug-config#storeddebugeventselector) |
| [`StoredDebugPayloadMode`](/api/debugging/read-stored-console-debug-config#storeddebugpayloadmode) |

### `@vuqs/core/debug/console`

| Export |
| --- |
| [`addConsoleDebugReporter`](/api/debugging/add-console-debug-reporter) |
| [`createConsoleReporter`](/api/debugging/create-console-reporter) |
| [`createPerformanceReporter`](/api/debugging/create-performance-reporter) |
| [`readStoredConsoleDebugConfig`](/api/debugging/read-stored-console-debug-config) |
| [`VUQS_DEBUG_CONFIG_VERSION`](/api/debugging/read-stored-console-debug-config) |
| [`VUQS_DEBUG_STORAGE_KEY`](/api/debugging/read-stored-console-debug-config) |
| [`AddConsoleDebugReporterOptions`](/api/debugging/add-console-debug-reporter#addconsoledebugreporteroptions) |
| [`ConsoleReporterOptions`](/api/debugging/create-console-reporter#consolereporteroptions) |
| [`ConsoleDebugPreset`](/api/debugging/create-console-reporter#consoledebugpreset) |
| [`DebugEventFilter`](/api/debugging/create-console-reporter#debugeventfilter) |
| [`DebugEventSelector`](/api/debugging/create-console-reporter#debugeventselector) |
| [`DebugPayloadMode`](/api/debugging/create-console-reporter#debugpayloadmode) |
| [`PerformanceDebugReporter`](/api/debugging/create-performance-reporter#performancedebugreporter) |
| [`PerformanceReporterOptions`](/api/debugging/create-performance-reporter#performancereporteroptions) |
| [`StoredDebugConfigV1`](/api/debugging/read-stored-console-debug-config#storeddebugconfigv1) |
| [`StoredConsoleDebugConfig`](/api/debugging/read-stored-console-debug-config#storedconsoledebugconfig) |
| [`StoredConsoleDebugResolution`](/api/debugging/read-stored-console-debug-config#storedconsoledebugresolution) |
| [`StoredConsoleReporterOptions`](/api/debugging/read-stored-console-debug-config#storedconsolereporteroptions) |
| [`StoredDebugEventFilter`](/api/debugging/read-stored-console-debug-config#storeddebugeventfilter) |
| [`StoredDebugEventSelector`](/api/debugging/read-stored-console-debug-config#storeddebugeventselector) |
| [`StoredDebugPayloadMode`](/api/debugging/read-stored-console-debug-config#storeddebugpayloadmode) |

### `@vuqs/core/debug-protocol`

| Export |
| --- |
| [`DebugEventMap`](/api/debug-events) |
| [`DebugEventCode`](/api/debug-events) |
| [`DebugScope`](/api/debug-events) |
| [`LogDebugCode`](/api/debug-events) |
| [`WarnDebugCode`](/api/debug-events) |
| [`KnownDebugEvent`](/api/debug-events) |
| [`DebugSnapshot`](/api/debugging/get-debug-snapshot#debugsnapshot) |
| [`DebugSnapshotByKind`](/api/debugging/get-debug-snapshot#debugsnapshotbykind) |
| [`DebugSnapshotKind`](/api/debugging/get-debug-snapshot#debugsnapshotkind) |
| [`EngineSnapshot`](/api/debugging/get-debug-snapshot#enginesnapshot) |
| [`QueueSnapshot`](/api/debugging/get-debug-snapshot#queuesnapshot) |
| [`StorageSnapshot`](/api/debugging/get-debug-snapshot#storagesnapshot) |

### `@vuqs/core/adapters/vue-router`

| Export |
| --- |
| [`createVueRouterAdapter`](/api/adapters/create-vue-router-adapter) |
| [`provideVueRouterAdapter`](/api/adapters/provide-vue-router-adapter) |
| [`VueRouterAdapterOptions`](/api/adapters/create-vue-router-adapter#vuerouteradapteroptions) |

### `@vuqs/core/adapters/browser-history`

| Export |
| --- |
| [`createBrowserHistoryAdapter`](/api/adapters/create-browser-history-adapter) |
| [`provideBrowserHistoryAdapter`](/api/adapters/provide-browser-history-adapter) |
| [`BrowserHistoryAdapter`](/api/adapters/create-browser-history-adapter#browserhistoryadapter) |
| [`BrowserHistoryAdapterOptions`](/api/adapters/create-browser-history-adapter#browserhistoryadapteroptions) |

### `@vuqs/core/modules`

| Export |
| --- |
| [`createWebStorage`](/api/modules/create-web-storage) |
| [`withActiveParams`](/api/modules/with-active-params) |
| [`withContext`](/api/modules/with-context) |
| [`withRuntimeDefaults`](/api/modules/with-runtime-defaults) |
| [`withStorage`](/api/modules/with-storage) |
| [`ActiveParamsOptions`](/api/modules/with-active-params#activeparamsoptions) |
| [`ActiveParamsStatesApi`](/api/modules/with-active-params#activeparamsstatesapi) |
| [`ActiveParamsStateApi`](/api/modules/with-active-params#activeparamsstateapi) |
| [`ContextBaseOptions`](/api/modules/with-context#contextbaseoptions) |
| [`ContextNavigate`](/api/modules/with-context#contextnavigate) |
| [`ContextStatesApi`](/api/modules/with-context#contextstatesapi) |
| [`ContextStateApi`](/api/modules/with-context#contextstateapi) |
| [`QueryStatesContextOptions`](/api/modules/with-context#querystatescontextoptions) |
| [`QueryStateContextOptions`](/api/modules/with-context#querystatecontextoptions) |
| [`RuntimeDefaultsStatesApi`](/api/modules/with-runtime-defaults#runtimedefaultsstatesapi) |
| [`RuntimeDefaultsStateApi`](/api/modules/with-runtime-defaults#runtimedefaultsstateapi) |
| [`Awaitable`](/api/modules/with-storage#awaitable) |
| [`QueryStorage`](/api/modules/with-storage#querystorage) |
| [`StoredQuerySnapshot`](/api/modules/with-storage#storedquerysnapshot) |
| [`StorageOptions`](/api/modules/with-storage#storageoptions) |
| [`StorageRestorePolicy`](/api/modules/with-storage#storagerestorepolicy) |
| [`StorageStatus`](/api/modules/with-storage#storagestatus) |
| [`StorageControls`](/api/modules/with-storage#storagecontrols) |
| [`StorageApi`](/api/modules/with-storage#storageapi) |

### `@vuqs/core/shared`

| Export |
| --- |
| [`pickBy`](/api/utils/pick-by) |
| [`omitBy`](/api/utils/omit-by) |
| [`definedOnly`](/api/utils/defined-only) |
| [`toReadonlyState`](/api/utils/to-readonly-state) |

### `@vuqs/core/adapters/testing`

| Export |
| --- |
| [`createTestingAdapter`](/api/testing/create-testing-adapter) |
| [`withVuqsTestingAdapter`](/api/testing/with-vuqs-testing-adapter) |
| [`TestingAdapter`](/api/testing/create-testing-adapter#testingadapter) |
| [`TestingAdapterOptions`](/api/testing/create-testing-adapter#testingadapteroptions) |
| [`UrlUpdateEvent`](/api/testing/create-testing-adapter#urlupdateevent) |
| [`OnUrlUpdateFunction`](/api/testing/create-testing-adapter#onurlupdatefunction) |

### `@vuqs/core/testing`

| Export |
| --- |
| [`isCodecBijective`](/api/testing/is-codec-bijective) |
| [`testSerializeThenParse`](/api/testing/test-serialize-then-parse) |
| [`testParseThenSerialize`](/api/testing/test-parse-then-serialize) |

### `@vuqs/nuxt`

| Export |
| --- |
| [`AdapterOptions`](/nuxt/configuration#types) |
| [`AutoImportsOptions`](/nuxt/configuration#types) |
| [`DebugOptions`](/nuxt/configuration#types) |
| [`DebugTargetOption`](/nuxt/configuration#types) |
| [`ModuleOptions`](/nuxt/configuration#types) |
