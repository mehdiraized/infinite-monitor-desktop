/**
 * Desktop override: disable the upstream instrumentation hook.
 *
 * The upstream register() pre-warms the widget base template by importing
 * @/lib/widget-runner which pulls in @secure-exec/core and isolated-vm.
 * In the standalone build these native/polyfilled modules fail to load
 * (Turbopack adds hash suffixes to external package names that don't match
 * the on-disk node_modules layout), causing a fatal instrumentation error
 * that makes the server return 500 on every request.
 *
 * The template is rebuilt on demand at runtime, so skipping the warm-up is safe.
 */
export async function register() {
  // no-op for desktop
}
