"""
Test collection setup.

WeasyPrint needs native GTK/Pango libraries (gobject-2.0-0 etc.) that
are present in the Linux/Railway prod container but not on a plain
Windows dev machine — importing routers.reports (which imports
services.report_generator -> weasyprint at module level) otherwise
fails before any test in the suite can even collect, regardless of
what that test actually exercises.

No test here calls generate_pdf_report or exercises WeasyPrint's real
rendering, so if the real import fails, stub it out just enough for
`import main` to succeed. Where the real library *does* import fine
(CI/prod), this is a no-op and the genuine module is used.
"""
import sys
import types

try:
    import weasyprint  # noqa: F401
except Exception:
    for _name in ("weasyprint", "weasyprint.text", "weasyprint.text.fonts"):
        sys.modules[_name] = types.ModuleType(_name)
    sys.modules["weasyprint"].HTML = lambda *a, **k: None
    sys.modules["weasyprint"].CSS = lambda *a, **k: None
    sys.modules["weasyprint"].text = sys.modules["weasyprint.text"]
    sys.modules["weasyprint.text"].fonts = sys.modules["weasyprint.text.fonts"]
    sys.modules["weasyprint.text.fonts"].FontConfiguration = object
