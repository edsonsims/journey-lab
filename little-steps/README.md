# LittleSteps — printable activity baseline

Fictional learning studio for Journey Lab's `print-context-v1` experiment. A visitor chooses age and interest without an account, opens an activity and can inspect its actual two-sheet print-and-make worksheet. The activity requires a printer, paper, scissors and a pencil. Materials are explained on the activity detail page. There is intentionally no on-screen alternative in this baseline; whether a persona identifies that mismatch must be established through an independent journey.

The teacher perspective can inspect a usable printable preparation plan. A parent without a printer cannot carry out this cut-and-arrange activity immediately. Neither persona is instructed which conclusion to reach.

Run from the project root: `python3 -m http.server 4320 --bind 127.0.0.1 --directory little-steps`.

Selections and the preparation plan stay in `sessionStorage`. No account, network request, automatic download or print job is created. “Preparation plan ready” means the instructions are saved locally, not that printing or preparation physically happened. The optional legacy signup page is a local demonstration only.

Stable hooks: `data-testid="activity-start"`, `#setup-form`, `#age`, `#interest`, `#activity-title`, `#activity-age`, `#activity-interest`, `data-testid="activity-materials"`, `data-testid="prepare-activity"`, `data-testid="printable-worksheet"`, and `data-testid="activity-ready"`.
