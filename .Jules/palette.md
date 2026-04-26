## 2025-04-26 - Add missing ARIA labels to icon-only buttons
**Learning:** Found multiple icon-only buttons in Angular templates without ARIA labels, which impacts screen reader users. The `mat-icon` components alone are not descriptive enough.
**Action:** Always verify icon-only buttons have an `aria-label` added.
