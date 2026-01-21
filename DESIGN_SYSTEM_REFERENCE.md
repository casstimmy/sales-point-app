# Design System Quick Reference

## Color Tokens

### Primary (Action Colors)
```
primary-50   #f0f9ff
primary-100  #e0f2fe
primary-200  #bae6fd
primary-300  #7dd3fc
primary-400  #38bdf8
primary-500  #0ea5e9
primary-600  #0284c7   ← Use this for buttons, headers
primary-700  #0369a1   ← Hover state
primary-800  #075985
primary-900  #0c3d66
```

### Secondary (Accent/Special Actions)
```
secondary-50   #fff7ed
secondary-100  #ffedd5
secondary-200  #fed7aa
secondary-400  #fb923c
secondary-500  #f97316
secondary-600  #ea580c   ← Use this for secondary buttons
secondary-700  #c2410c   ← Hover state
secondary-900  #7c2d12
```

### Neutral (Backgrounds & Text)
```
neutral-50    #f9fafb   ← Lightest backgrounds
neutral-100   #f3f4f6   ← Light gray backgrounds
neutral-200   #e5e7eb   ← Borders, dividers
neutral-300   #d1d5db   ← Inactive states
neutral-400   #9ca3af   ← Secondary text
neutral-500   #6b7280   ← Muted text
neutral-600   #4b5563   ← Body text
neutral-700   #374151   ← Headings
neutral-800   #1f2937   ← Dark text
neutral-900   #111827   ← Darkest text
```

### Status Colors (Keep as-is)
```
green-500/600   ← Success, positive actions
red-500/600     ← Danger, negative actions, errors
yellow-500/600  ← Warnings
blue-500/600    ← Info (if not using primary)
```

## Spacing Scale

All measurements are in `0.25rem` (4px) increments:

```
0   = 0
1   = 0.25rem (4px)
2   = 0.5rem (8px)
3   = 0.75rem (12px)
4   = 1rem (16px)      ← Most common padding
6   = 1.5rem (24px)
8   = 2rem (32px)      ← Section margins
10  = 2.5rem (40px)
12  = 3rem (48px)
16  = 4rem (64px)
```

## Typography Scale

```
xs   12px   ← Small labels, hints
sm   14px   ← Secondary text
base 16px   ← Body text (default)
lg   18px   ← Slightly larger body
xl   20px   ← Section titles
2xl  24px   ← Page titles
3xl  30px   ← Large headings
4xl  36px   ← Hero text
```

### Font Weights
```
light       300
normal      400
medium      500   ← Labels, secondary text
semibold    600   ← Buttons, headings
bold        700   ← Strong emphasis
extrabold   800   ← Hero text
```

## Component Patterns

### Buttons

#### Primary Button (Action)
```jsx
<button className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold transition-colors duration-base">
  Click Me
</button>
```

#### Secondary Button (Alternative)
```jsx
<button className="px-4 py-2 bg-secondary-600 hover:bg-secondary-700 text-white rounded-lg font-semibold transition-colors duration-base">
  Secondary
</button>
```

#### Outline Button (Non-destructive)
```jsx
<button className="px-4 py-2 border-2 border-primary-600 text-primary-600 hover:bg-primary-50 rounded-lg font-semibold transition-colors duration-base">
  Outline
</button>
```

#### Danger Button (Delete/Destructive)
```jsx
<button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors duration-base">
  Delete
</button>
```

### Cards & Containers

```jsx
<div className="bg-white border border-neutral-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-base">
  Card content here
</div>
```

### Form Inputs

```jsx
<input 
  type="text"
  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
  placeholder="Enter text..."
/>
```

### Modals/Overlays

```jsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md w-full">
    <h2 className="text-2xl font-bold text-neutral-900 mb-4">Modal Title</h2>
    <p className="text-neutral-600 mb-6">Modal content here</p>
    <div className="flex gap-2 justify-end">
      <button className="px-4 py-2 text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors duration-base">
        Cancel
      </button>
      <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors duration-base">
        Confirm
      </button>
    </div>
  </div>
</div>
```

### Status/Badge

```jsx
<span className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium">
  Active
</span>
```

### Dividers

```jsx
<div className="border-b border-neutral-200 my-4"></div>
```

### Text Styles

```jsx
<h1 className="text-4xl font-bold text-neutral-900">Page Title</h1>
<h2 className="text-2xl font-semibold text-neutral-800">Section Title</h2>
<p className="text-base text-neutral-600">Body text</p>
<small className="text-sm text-neutral-500">Secondary text or caption</small>
```

## Common Patterns

### Hover & Focus States
```jsx
// Button with proper hover/focus
className="... transition-colors duration-base hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"

// Link with proper states
className="text-primary-600 hover:text-primary-700 focus:outline-none focus:underline"
```

### Disabled States
```jsx
className="... disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary-600"
```

### Loading States
```jsx
className="... animate-spin text-primary-600"
```

### Responsive Text
```jsx
className="text-base md:text-lg lg:text-xl"
```

## Migration Checklist

When updating a component:

- [ ] Replace `bg-gray-*` with `bg-neutral-*`
- [ ] Replace `text-gray-*` with `text-neutral-*`
- [ ] Replace `border-gray-*` with `border-neutral-*`
- [ ] Replace `bg-blue-*` with `bg-primary-*`
- [ ] Replace `text-blue-*` with `text-primary-*`
- [ ] Replace `border-blue-*` with `border-primary-*`
- [ ] Replace `bg-orange-*` with `bg-secondary-*`
- [ ] Add `duration-base` to all transitions
- [ ] Update `rounded` to `rounded-lg` for cards/modals
- [ ] Use `shadow-sm`, `shadow-md`, `shadow-lg` from scale
- [ ] Check for `transition-colors`, `transition-all`, `hover:bg-*`, `hover:text-*`

## File Locations

- **Design Tokens**: `/src/styles/designTokens.js`
- **Component Styles**: `/src/styles/componentStyles.js`
- **Global Styles**: `/src/styles/globals.css`
- **Tailwind Config**: `/tailwind.config.js`

## Imports (If Needed)

```javascript
// For component styles utilities
import { buttonStyles, inputStyles, cardStyles, modalStyles, cx } from '@/src/styles/componentStyles';

// For design tokens (reference)
import designTokens from '@/src/styles/designTokens';
```

## Examples by Component Type

### Payment Form
- Use `bg-primary-50` or `bg-primary-100` for input backgrounds
- Use `border-primary-300` for focused borders
- Use `text-primary-600` for important amounts/prices
- Use `bg-primary-600` for submit buttons

### Status/Info Box
- Use `bg-primary-50 border-primary-200 text-primary-700` for info
- Use `bg-green-50 border-green-200 text-green-700` for success
- Use `bg-red-50 border-red-200 text-red-700` for errors
- Use `bg-yellow-50 border-yellow-200 text-yellow-700` for warnings

### Data Tables
- Use `border-neutral-200` for borders
- Use `bg-neutral-50` for row striping
- Use `text-neutral-600` for secondary data
- Use `text-neutral-900` for primary data

### Navigation
- Use `bg-primary-600` or `bg-primary-700` for headers
- Use `text-white` for header text
- Use `hover:bg-primary-700` for nav item hover
- Use `border-primary-500` for active nav items

## Tips

1. **Always use consistent spacing**: Stick to the scale (1, 2, 3, 4, 6, 8, 10, 12, 16)
2. **Transitions**: Always add `duration-base` (200ms) for smooth animations
3. **Borders**: Use `border-neutral-200` for most borders, `border-neutral-300` for stronger definition
4. **Shadows**: Use `shadow-sm` for subtle elevation, `shadow-lg` or `shadow-xl` for modals
5. **Rounding**: Use `rounded` for small elements, `rounded-lg` for cards/buttons/modals
6. **Text colors**: Use `text-neutral-600` for body, `text-neutral-700` for labels, `text-neutral-900` for headings
7. **Hover effects**: Always include `transition-colors duration-base` when adding hover states
