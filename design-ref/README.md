# Astro Bakes — design source (V2 · Fun)

These are the source files behind the approved mockups on the Design canvas. Use them as the **visual reference**: copy exact colours, sizes, spacing, borders, shadows and copy from them. They are not production code.

Read alongside:

- `HANDOFF.md`: the design handoff doc (tokens, components, screen-by-screen spec, placeholders). Export it from the doc as Markdown and drop it in this folder.
- The Website PRD: all behaviour, data and business rules.

## Files

| File | What it is |
| --- | --- |
| `design/Fun.dc.html` | Homepage, mobile (390px), drop open |
| `design/FunDesktop.dc.html` | Homepage, desktop (1280px), drop open |
| `design/Checkout.dc.html` | Mobile buy flow, all steps in one component: `cart`, `soldout`, `signin`, `code`, `delivery`, `pay`, `done` |
| `design/CheckoutDesktop.dc.html` | Desktop buy flow, same steps, two-column layout |
| `design/Checkout*.dc.html` (others) | Thin wrappers that render one step of the two components above |
| `assets/*.jpg` | Two low-res Astro photos (placeholders until originals are supplied) |

## How to read a `.dc.html` file

They are HTML with inline styles, plus a small template layer from the design tool. They won't render on their own (they need the tool's `support.js` runtime), but they read easily:

- Markup inside `<x-dc>` is the page. Styles are inline `style="…"`; page-level CSS (fonts, keyframes) is in `<helmet><style>`.
- `{{name}}` inserts a value computed in the `renderVals()` method of the `<script type="text/x-dc">` block at the bottom.
- `<sc-if value="{{flag}}">…</sc-if>` renders its content only when `flag` is true.
- `<sc-for list="{{items}}" as="it">…</sc-for>` repeats its content once per item.
- `onClick="{{handler}}"` binds a handler from `renderVals()`.
- `<dc-import name="Checkout" step="pay">` mounts `Checkout.dc.html` with that prop.
- `href="Checkout.dc.html"` links are prototype navigation between screens; map them to real routes.

All sample data in the mocks (dates, counts, prices marked `[fee]` / `[total]` / `[price]`, names, addresses, order number) must be wired to real data per the PRD.
