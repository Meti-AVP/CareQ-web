import type { Config } from 'tailwindcss';
import preset from '@carq/ui/tailwind-preset';

/** الهوية كلها جاية من الـpreset — ممنوع تعريف ألوان هنا */
const config: Config = {
  presets: [preset as Config],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
