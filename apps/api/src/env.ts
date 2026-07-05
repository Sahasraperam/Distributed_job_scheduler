import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const rootEnv = path.join(process.cwd(), '.env');
const parentEnv = path.join(process.cwd(), '..', '.env');
const grandparentEnv = path.join(process.cwd(), '../..', '.env');

if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else if (fs.existsSync(parentEnv)) {
  dotenv.config({ path: parentEnv });
} else if (fs.existsSync(grandparentEnv)) {
  dotenv.config({ path: grandparentEnv });
}
