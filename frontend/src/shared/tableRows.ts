export const TABLE_CLASSES = 'w-full border-separate border-spacing-x-0 border-spacing-y-2'
export const TABLE_HEAD_CLASSES = 'table-head sticky top-0 z-10 bg-[var(--table-backdrop)]'
export const TABLE_SCROLL_GUTTER_CLASSES = 'pr-5'
const ROW_SHAPE_CLASSES =
  '[&>td]:bg-[var(--row-bg)] [&>td]:shadow-[-1px_0_0_0_var(--row-bg),0_2px_0_0_rgb(0_0_0/0.07)] [&>td:first-child]:shadow-[0_2px_0_0_rgb(0_0_0/0.07)] [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl [&>td]:h-20 [&>td]:align-middle [&>td]:transition-colors'
export const TABLE_ROW_CLASSES = `${ROW_SHAPE_CLASSES} [--row-bg:var(--color-surface)] hover:[--row-bg:var(--color-surface-brand)]`
export const TABLE_GROUP_ROW_CLASSES = `${ROW_SHAPE_CLASSES} [--row-bg:var(--color-surface-brand)]`
