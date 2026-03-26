import classes from './SkipToMain.module.css';

export function SkipToMain() {
  return (
    <a href="#main-content" className={classes.skipLink}>
      Skip to main content
    </a>
  );
}
