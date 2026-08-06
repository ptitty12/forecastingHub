/**
 * Every explanation the UI shows, in one place.
 *
 * House style: plain language, no jargon, no acronyms a seller wouldn't use
 * out loud. Say what the number IS, then what to DO with it. One or two
 * sentences — if it needs three, the UI is too complicated.
 */

export const COLUMN_HELP = {
  actuals: {
    title: 'Actuals',
    body: 'What has already landed this quarter — real, booked business. Nobody can edit this; it comes straight from the orders and sales system.',
  },
  pipelineOpen: {
    title: 'Open pipeline',
    body: 'Everything still open in Salesforce that is expected to close in this quarter, added up at full value. Click the ▸ arrow on the row to see the individual deals.',
  },
  suggestedAllBfo: {
    title: 'All-deals suggestion',
    body: 'Actuals plus 100% of your open pipeline — the "if literally everything lands" number. Useful as a ceiling, not as a forecast.',
  },
  suggestedBuildup: {
    title: 'Suggested forecast',
    body: 'Our best starting guess: actuals plus your open pipeline weighted down by how likely each deal is. Start here, then adjust.',
  },
  adjustment: {
    title: 'Adjustment',
    body: 'How much you are adding to or taking off the suggestion. Type -500K if you think half a million slips; the total updates itself.',
  },
  totalForecast: {
    title: 'Total forecast',
    body: 'Your number — what you are committing to for the quarter. Type the total directly if that is easier than working out an adjustment; the two stay in sync.',
  },
  comments: {
    title: 'Comments',
    body: 'Why your number differs from the suggestion. Your manager reads this instead of calling you, so a short reason saves you a meeting.',
  },
  lastEdit: {
    title: 'Last edit',
    body: 'Who last touched this row and when. Click it to see every change ever made, oldest to newest.',
  },
} as const

export const CONTROL_HELP = {
  periods: {
    title: 'Quarters',
    body: 'Click a quarter to forecast it. Click more than one to see them side by side — future quarters are open for entry even before any business lands.',
  },
  asOf: {
    title: 'See as of',
    body: 'Rewind the forecast to any past date to see what everyone had entered back then. Read-only, so you cannot change history by accident.',
  },
  compare: {
    title: 'Compare to now',
    body: 'Adds two columns: what the number is today, and how much it moved since the date you picked. Handy for "what changed this week?".',
  },
  showAll: {
    title: 'Show all slices',
    body: 'Off by default, which hides rows with no business and no pipeline. Turn it on to enter a forecast for something that has not started yet.',
  },
  visuals: {
    title: 'Visuals',
    body: 'Show or hide the two charts above the grid. Hiding them gives you more rows on screen.',
  },
  history: {
    title: 'Change history',
    body: 'Every edit anyone made to this view — what changed, from what to what, by whom, and when. Nothing is ever silently overwritten.',
  },
  filters: {
    title: 'Filters',
    body: 'Narrow the grid to one seller, account, or product at a time. Filters also apply to the totals and charts, so the numbers always match what you see.',
  },
  expandRow: {
    title: 'The deals behind a row',
    body: 'Opens the Salesforce opportunities making up that pipeline number — name, amount, and likelihood. Click a deal name to open it in Salesforce.',
  },
  amountFormat: {
    title: 'Typing amounts',
    body: 'Shorthand works: 1.2M, 500K, or 2500000. Commas and dollar signs are fine too. Leave a cell empty to clear it.',
  },
} as const

export const ADMIN_HELP = {
  businessUnit: {
    title: 'Business unit',
    body: 'The top-level team, like a division. Pick an existing one, or create a new one if this is a team we have never forecast before.',
  },
  configName: {
    title: 'View name',
    body: 'What this particular way of forecasting is called — usually the sub-segment, like "Field Sales" or "Named Accounts". One team can have several.',
  },
  levels: {
    title: 'Forecast levels',
    body: 'The rows sellers will fill in. Level 1 is the widest grouping, each level below splits it further. Most teams use two or three; you can add up to eight.',
  },
  customDimension: {
    title: 'Custom dimension',
    body: 'For groupings we do not offer out of the box. You give it a name and a SQL expression over the standard columns, and it becomes a level like any other.',
  },
  bucketRollups: {
    title: 'Product groups',
    body: 'Bundle individual product buckets into bigger groups, then forecast to the group. Written as JSON: a group name, then the buckets inside it.',
  },
  metric: {
    title: 'Forecast metric',
    body: 'Whether this team forecasts on orders (when the customer commits) or sales (when we invoice). Add a rule below if part of the portfolio works the other way.',
  },
  lensRule: {
    title: 'Exception rules',
    body: 'Overrides for part of the portfolio — for example, software forecast on sales while hardware stays on orders. Rules are checked in order; the first match wins.',
  },
  metricSql: {
    title: 'Metric as SQL',
    body: 'For lenses too complicated for simple rules. Write an expression that returns the word Orders or Sales for each row.',
  },
  weighting: {
    title: 'Pipeline weighting',
    body: 'How open deals feed the suggested forecast. Win probability scales each deal by its likelihood; probability threshold counts only deals above a bar you set, at full value.',
  },
  threshold: {
    title: 'Probability threshold',
    body: 'Deals at or above this likelihood count in full; everything below is ignored. A common choice is the stage where your team considers a deal real.',
  },
  sourceViews: {
    title: 'Production source views',
    body: 'The database views this team’s numbers come from, once real data is wired up. Purely documentation today — safe to leave blank.',
  },
  editing: {
    title: 'Editing a view',
    body: 'Changes take effect immediately for everyone. Renaming or re-weighting is safe. Changing levels re-shapes the grid, so forecasts entered against the old shape stop showing until the shape matches again — nothing is deleted.',
  },
  deactivate: {
    title: 'Deactivating',
    body: 'Hides the view from the forecast picker without deleting anything. Entries and history stay put and come straight back if you switch it on again.',
  },
} as const

export const DASHBOARD_HELP = {
  trajectory: {
    title: 'Forecast trajectory',
    body: 'How actuals, the suggestion, and the committed forecast move quarter to quarter. A big gap between the green and blue lines means a lot is still riding on pipeline.',
  },
  explorer: {
    title: 'Breakdown',
    body: 'Same numbers, split whichever way you like. Change what is measured and how it is grouped with the two dropdowns.',
  },
  measure: {
    title: 'Measure',
    body: 'Which number the chart plots — the committed forecast, the suggestion, actuals, or raw open pipeline.',
  },
  groupBy: {
    title: 'Group by',
    body: 'Which of this view’s levels to split the bars or lines by. Only the top values get their own colour; the rest are grouped as "Other".',
  },
  chartType: {
    title: 'Chart type',
    body: 'Stacked bars show how the total is made up. Lines show how each group moves over time. Same data either way.',
  },
} as const

export const FORECAST_STEPS = [
  {
    heading: 'Pick your quarter',
    body: 'Chips at the top. Pick more than one to work several at once.',
  },
  {
    heading: 'Read the suggestion',
    body: 'We add what you have booked to your weighted pipeline. Check it against reality.',
  },
  {
    heading: 'Enter your number',
    body: 'Click Adjustment or Total forecast and type. Shorthand like 1.2M works.',
  },
  {
    heading: 'Say why',
    body: 'A one-line comment in the last column saves you the follow-up call.',
  },
] as const

export const ADMIN_STEPS = [
  {
    heading: 'Pick the team',
    body: 'An existing business unit, or create a new one on the spot.',
  },
  {
    heading: 'Choose the levels',
    body: 'How this team wants its grid sliced — seller, account, product, or your own.',
  },
  {
    heading: 'Set the rules',
    body: 'Orders or sales, and how open pipeline counts toward the suggestion.',
  },
  {
    heading: 'Save and it is live',
    body: 'The view appears in the picker straight away. Edit or deactivate any time.',
  },
] as const
