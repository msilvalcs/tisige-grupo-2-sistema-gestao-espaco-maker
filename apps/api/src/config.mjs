import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
export const config = {
  databaseUrl: process.env.DATABASE_URL,
  port: Number(process.env.PORT || 3001),
  production: process.env.NODE_ENV === 'production',
};
if (!config.databaseUrl)
  throw new Error('DATABASE_URL não definida. Copie .env.example para .env.');
