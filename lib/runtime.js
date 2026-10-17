import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
export const runtime = process.env.DSH_RUNTIME || join(homedir(), '.local/share/deepseek-harness/runtime');
const require = createRequire(join(runtime, 'package.json'));
export const harness = async name => import(require.resolve(`@deepseek-ai/${name}`));
