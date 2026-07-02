# v20 Mobile Usability QA

Test target: `xinghai_ai_founder_v20.html`

## Issues Found From User Screenshot And Code Review

- QR hover popover had visible artifacts from the old CSS placeholder QR.
- QR popover floated over the final CTA title on mobile, making the screen feel broken.
- Mobile page felt too heavy: large card heights, large section spacing, and large visual blocks created long scroll.
- Top-left brand was still the old `小小 AI 创业家` text and CSS-drawn mark.
- Mentor photo asset was too heavy for mobile loading.

## Fixes Applied

- Replaced top-left brand text with `星海少年AI计划`.
- Generated and added `assets/brand-mark-xinghai-v20.png` with Image 2.0.
- Removed fake QR background and pseudo QR markers from the real QR container.
- Desktop QR remains a hover/focus popover.
- Mobile QR now expands inline below the button instead of floating over the title.
- Reduced mobile section padding, hero card size, course card height, workspace card density, outcome card height, and mentor photo height.
- Replaced the 3.9MB mentor PNG reference with `assets/mentor-wanghao-v20.jpg`, about 164KB.

## Automated Checks

- Passed: CSS brace balance.
- Passed: Section open/close balance.
- Passed: All anchors point to valid ids.
- Passed: Referenced assets exist.
- Passed: No old `领取课程安排` CTA.
- Passed: No `data:image` embedded mentor image.
- Passed: QR fake background pattern removed.
- Passed: Mobile QR popover has `position: static`.

## Remaining Visual QA

The Codex in-app browser blocks Browser Use from reading local `file://` pages, even when the tab is already open. Final visual QA should be run after one of these:

- Deploy `/tmp/xinghai-deploy/index.html` and test the live URL.
- Open a browser-accessible local HTTP preview if explicitly allowed for testing.

Focus points for visual QA:

- Final CTA QR open state on iPhone width.
- Header brand text fitting next to `预约咨询`.
- Hero project cards in two columns on mobile.
- Workspace kit badge density.
- Mentor card crop and badge position.
