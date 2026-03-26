import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'ocean',
  primaryShade: 6,
  fontFamily: '"IBM Plex Sans", "Avenir Next", sans-serif',
  headings: {
    fontFamily: '"Space Grotesk", "IBM Plex Sans", sans-serif',
    fontWeight: '700',
  },
  defaultRadius: 'xl',
  colors: {
    ocean: [
      '#ecfbf9',
      '#d4f5f0',
      '#aae9df',
      '#7fddd0',
      '#58d1c0',
      '#35c5b1',
      '#20a998',
      '#12806d',
      '#0d6658',
      '#0b5045',
    ],
    sand: [
      '#fdf9f1',
      '#f8f0df',
      '#f1e1bd',
      '#e9d39b',
      '#e2c57a',
      '#dbb858',
      '#c6a040',
      '#9c7c2d',
      '#72591f',
      '#493811',
    ],
  },
});
