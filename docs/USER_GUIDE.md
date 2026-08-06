# Using the Forecasting Pub

For sellers and managers. No technical background needed — if you can read
your pipeline, you can use this.

There is a "?" next to almost everything in the app. Hover it for a
one-sentence explanation. This guide is the longer version.

---

## The short version

1. Open the app and check the **View** menu (top right) says your team.
2. Pick your **quarter**.
3. Look at the **Suggested forecast** — that's our starting guess.
4. Type your number into **Adjustment** or **Total forecast**.
5. Leave a **comment** saying why.

That's it. Everything saves the moment you press Enter or click away.

---

## Finding your numbers

### The View menu

Top right. Each team forecasts differently — some by seller and account,
some by region and state, some by product group. The View menu picks which
of those layouts you're looking at. Everything on the page follows it.

If your team isn't listed, an administrator hasn't set it up yet (or has
deactivated it). Ask them — it takes about a minute.

### Quarters

The chips near the top. Click one to work on it. Click several to see them
side by side — a **Period** column appears so you know which row is which.

Future quarters are open for entry even when nothing has been booked yet.
That's deliberate: you can forecast next quarter before it starts.

### Filters

The dropdowns below the charts narrow the grid to one seller, account, or
product at a time. They apply to the totals and charts too, so the tiles at
the top always describe exactly what you're looking at.

---

## The columns, left to right

| Column | What it means |
|---|---|
| **Actuals** | Business already booked this quarter. Comes from the source systems; nobody can type over it. |
| **Open pipeline** | Everything still open and expected to close this quarter, at full value. |
| **All-deals suggestion** | Actuals + 100% of open pipeline. The "if everything lands" number — a ceiling, not a forecast. |
| **Suggested forecast** | Actuals + pipeline weighted by how likely each deal is. **This is the number to start from.** |
| **Adjustment** | What you're adding or taking off the suggestion. Editable. |
| **Total forecast** | Your number for the quarter. Editable. |
| **Comments** | Why your number differs from the suggestion. Editable. |
| **Last edit** | Who last changed the row, and when. Click to see the full history. |

### How the suggestion is built

Two ways, depending on how your administrator set your team up — the
sentence under the grid always tells you which one is in force:

- **Win probability** — every open deal contributes a slice of its value,
  sized by its likelihood. A $1M deal at 40% adds $400K.
- **Probability threshold** — deals at or above a set likelihood count in
  **full**; anything below is ignored entirely. With a 45% bar, a $1M deal
  at 90% adds the whole $1M and a $1M deal at 25% adds nothing.

---

## Entering your forecast

Click any cell in **Adjustment** or **Total forecast** and type.

**Shorthand works.** `1.2M`, `500K`, `2500000`, `2,500,000`, and `$500K` all
mean what you'd expect. A leading minus makes it negative: `-750K`.

**The two columns stay in step.** They're two ways of saying the same thing:

- Type `-500K` in Adjustment → Total drops by 500K.
- Type `4M` in Total → the Adjustment shows what that implies versus the
  suggestion.

Whichever you touched last is the one that's remembered. So if you enter a
Total, it stays at that Total even if new business lands and the suggestion
moves. If you enter an Adjustment, your forecast moves with the suggestion.

> **Which should I use?** Use **Total** when you know your number. Use
> **Adjustment** when you're reacting to the suggestion — "this is about
> right, but that one deal is slipping."

**To clear a cell**, delete the contents and press Enter.

### Comments

The last editable column. One line is enough: *"Phase 2 verbal, PO expected
mid-September."* Your manager reads this instead of calling you.

Press **Ctrl+Enter** (or **Cmd+Enter**) to save a comment without reaching
for the mouse. **Escape** cancels.

---

## Seeing the deals behind a number

Click the **▸** arrow at the start of any row with pipeline. It opens the
list of actual Salesforce opportunities making up that number:

- account, opportunity name, ID, amount, win %, and stage
- whether each one **counts** toward the suggestion — with threshold
  weighting, deals below the bar are greyed out and marked "not counted"
- click any opportunity name to open it in Salesforce

This is the fastest way to answer "why is my suggestion so high?" — usually
one big deal that isn't as certain as the system thinks.

---

## Looking back in time

### See as of

Pick a date in **See as of** and the grid rewinds to what everyone had
entered on that date. Useful for "what did we say at the start of the
month?"

While you're in the past, editing is switched off so you can't rewrite
history by accident. A green bar at the top reminds you.

> **One thing to know:** only what people *typed* is rewound. Actuals and
> pipeline still show today's values, because the source systems don't keep
> daily snapshots yet.

### Compare to now

Tick this while a date is selected and two extra columns appear: what the
number is **today**, and the **Δ** (difference). Sort your eye down the Δ
column to see what moved.

### Change history

Two ways in:

- the **Change history** button (top right) — everything for this view
- clicking a name in the **Last edit** column — just that row

Every change ever made is listed: the field, the old value, the new value,
who did it, and when. Nothing is ever silently overwritten.

---

## The Dashboard tab

Same numbers, drawn as charts.

- **Forecast trajectory** — actuals, the suggestion, and the committed
  forecast across quarters. A wide gap between the lines means a lot is
  still riding on pipeline landing.
- **Breakdown** — the same data split whichever way you like. Two dropdowns
  control it: **measure** (what's plotted) and **group by** (how it's
  split). Switch between stacked bars and lines.

Hover anything for exact values. The filters at the top apply to every chart
and tile.

---

## Questions people ask

**Do I need to press Save?**
No. Every edit saves immediately. If a save fails you'll get a red message
saying so — nothing is lost silently.

**Someone else edited my row. What happens?**
The last edit wins, and the history shows both. Check **Change history** if
a number looks unfamiliar.

**My row is missing.**
Rows with no business and no pipeline are hidden by default. Tick **Show all
slices** to see them and forecast something that hasn't started yet.

**The grid is empty.**
Either your filters are hiding everything (the empty state tells you which
case you're in), or there genuinely is nothing in the quarter yet.

**Can I break something?**
Not really. Everything is versioned, nothing is deleted, and the past is
read-only. The worst case is a wrong number that someone can see and correct.

**I don't agree with the suggestion.**
That's the point — it's a starting guess from historical data, and you know
your accounts. Override it and say why in the comment.
