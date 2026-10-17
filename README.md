# DeepSeek Harness Codex and Grok CLI integration

This Node package contains the Codex CLI and Grok CLI adapter used by Agents Pro
for DeepSeek Harness. It routes signed-in local CLI sessions into Harness's LLM
adapter, validates structured tool requests against the tools Harness supplied,
and leaves tool execution and permissions with Harness. It does not need an xAI
API key for the CLI route or copy CLI login credentials into Harness.

## Install and use

Clone this repository beside
[`deepseek-project-specific-harness-launcher`](https://github.com/aipieksel/deepseek-project-specific-harness-launcher)
and [`deepseek-microphone-cleanup-integration`](https://github.com/aipieksel/deepseek-microphone-cleanup-integration).
Run `script/install-integrations.sh` from the launcher checkout; that installs
this package and the voice package into the local Agents Pro plugin. The CLI
executables and their existing sign-ins must be available on the host.

The launcher keeps the provider registration and model picker UI. This package
owns the adapter, CLI executable discovery, process calls, response validation,
and Harness runtime resolver. It is a Harness component, not a standalone chat UI.

Run `npm test` here for the adapter protocol tests; `npm pack --dry-run` shows the
package file list. The installed Harness runtime is required for a real provider
request. The bridge rejects malformed or unavailable tool requests before
dispatch and never grants the CLIs independent tool execution.

## Rights

Original code in this repository is licensed under the [MIT License](LICENSE).
DeepSeek Harness, Codex, and Grok retain their owners' separate rights; their
runtimes and credentials are not included here. This is an independent local
integration.
