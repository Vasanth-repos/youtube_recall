import os
import sys
from pathlib import Path
from datetime import datetime
import win32com.client

def create_native_word_report():
    docx_path = Path(r"C:\youtube recall solution\dist\YouTube_Recall_Complete_Updates.docx").resolve()
    pdf_path = Path(r"C:\youtube recall solution\dist\YouTube_Recall_Complete_Updates.pdf").resolve()
    root_docx_path = Path(r"C:\youtube recall solution\YouTube_Recall_Complete_Updates.docx").resolve()

    docx_path.parent.mkdir(parents=True, exist_ok=True)

    print("Launching Microsoft Word COM Engine...")
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0 # wdAlertsNone

    try:
        doc = word.Documents.Add()
        doc.PageSetup.TopMargin = 72 # 1 inch
        doc.PageSetup.BottomMargin = 72
        doc.PageSetup.LeftMargin = 72
        doc.PageSetup.RightMargin = 72

        def add_paragraph(text, style="Normal", bold=False, italic=False, size=11, color=0x2D3748, space_after=6, space_before=0):
            p = doc.Paragraphs.Add()
            p.Range.Text = text + "\n"
            p.Range.Font.Name = "Segoe UI"
            p.Range.Font.Size = size
            p.Range.Font.Bold = bold
            p.Range.Font.Italic = italic
            p.Range.Font.Color = color
            p.SpaceAfter = space_after
            p.SpaceBefore = space_before
            return p

        def add_heading(text, level=1):
            sizes = {1: (18, 0x993300, 16, 6), 2: (14, 0x1A202C, 12, 4), 3: (12, 0x4A5568, 8, 2)}
            sz, col, before, after = sizes.get(level, (12, 0x4A5568, 8, 2))
            return add_paragraph(text, bold=True, size=sz, color=col, space_before=before, space_after=after)

        def add_bullet(bold_prefix, text):
            p = doc.Paragraphs.Add()
            p.Range.Text = bold_prefix + " " + text + "\n"
            p.Range.Font.Name = "Segoe UI"
            p.Range.Font.Size = 10.5
            p.Range.Font.Color = 0x2D3748
            p.LeftIndent = 24
            p.FirstLineIndent = -12
            p.SpaceAfter = 4
            p.SpaceBefore = 0
            
            # Bold the prefix
            rng = p.Range
            rng.End = rng.Start + len(bold_prefix)
            rng.Bold = True
            rng.Font.Color = 0x993300
            return p

        def add_callout(title, text):
            p = doc.Paragraphs.Add()
            p.Range.Text = title + ": " + text + "\n"
            p.Range.Font.Name = "Segoe UI"
            p.Range.Font.Size = 10
            p.Range.Font.Color = 0x1A202C
            p.LeftIndent = 18
            p.RightIndent = 18
            p.SpaceBefore = 8
            p.SpaceAfter = 8
            
            # Shading and left border
            p.Shading.BackgroundPatternColor = 0xF0F4F8 # Light slate blue
            p.Borders(-2).LineStyle = 1 # wdBorderLeft = -2, wdLineStyleSingle = 1
            p.Borders(-2).LineWidth = 24 # 3pt
            p.Borders(-2).Color = 0xCE8231
            
            rng = p.Range
            rng.End = rng.Start + len(title) + 1
            rng.Bold = True
            rng.Font.Color = 0x993300
            return p

        def add_table(data):
            p = doc.Paragraphs.Add()
            rows = len(data)
            cols = len(data[0]) if rows > 0 else 0
            tbl = doc.Tables.Add(p.Range, rows, cols)
            tbl.Borders.Enable = True
            tbl.Borders.InsideLineStyle = 1
            tbl.Borders.InsideColor = 0xE2E8F0
            tbl.Borders.OutsideLineStyle = 1
            tbl.Borders.OutsideColor = 0xCBD5E0
            
            # Column widths
            if cols == 2:
                for r in range(1, rows + 1):
                    tbl.Cell(r, 1).Width = 180
                    tbl.Cell(r, 2).Width = 320

            for r_idx, row in enumerate(data):
                for c_idx, val in enumerate(row):
                    cell = tbl.Cell(r_idx + 1, c_idx + 1)
                    cell.Range.Text = val
                    cell.Range.Font.Name = "Segoe UI"
                    cell.Range.Font.Size = 9.5
                    cell.VerticalAlignment = 1 # Center
                    if r_idx == 0:
                        cell.Range.Font.Bold = True
                        cell.Range.Font.Color = 0xFFFFFF
                        cell.Shading.BackgroundPatternColor = 0x993300 # Deep blue
                    else:
                        cell.Range.Font.Color = 0x2D3748
                        if r_idx % 2 == 1:
                            cell.Shading.BackgroundPatternColor = 0xF7FAFC

            # Add space after table
            p_after = doc.Paragraphs.Add()
            p_after.SpaceAfter = 12

        # --- DOCUMENT CONTENT GENERATION ---

        # Title Block
        add_paragraph("YOUTUBE RECALL & SPACED REPETITION ENGINE", bold=True, size=24, color=0x702000, space_after=4)
        add_paragraph("Complete System Architecture, Bug Resolutions & Cross-Platform Release Report", italic=True, size=13, color=0x4A5568, space_after=10)
        add_paragraph(f"Generated: {datetime.now().strftime('%B %d, %Y')} | Status: Production Verified | Version: 2.0.0", bold=True, size=9.5, color=0x718096, space_after=18)

        # 1. Executive Summary
        add_heading("1. Executive Summary", level=1)
        add_paragraph("This document serves as the comprehensive engineering summary for the YouTube Recall & Spaced Repetition platform. The solution converts dense, multi-hour instructional and academic YouTube videos into high-density 5-minute Rapid Recall cheat sheets, structured chapter notes, authentic formula derivations, and SuperMemo SM-2 spaced repetition decks.")
        add_paragraph("Key accomplishments include the resolution of AI speech-to-text false-positive hallucinations, native Windows desktop application packaging with dedicated windowing, client-side on-device distillation for Android mobile, and production security hardening.")

        add_table([
            ["Deliverable Component", "Specification & Deployment Status"],
            ["Windows Desktop Executable", "dist/YouTubeRecall.exe (33.7 MB) - Native desktop window (no browser tabs)"],
            ["Android Mobile Package", "dist/youtube-recall.apk (4.88 MB) - Complete on-device distillation engine"],
            ["AI Synthesis Pipeline", "Google Gemini 3.5 Flash Lite priority, Groq Llama-3.3, Offline Synthesizer"],
            ["Spaced Repetition Schedule", "SM-2 Algorithmic Intervals (0, 1, 3, 7, 15, 30, 60, 90, 180 days)"],
            ["Database Persistence", "SQLite (recall.db) with multi-user isolation & automatic schema initialization"],
            ["Git Repository Status", "https://github.com/Vasanth-repos/youtube_recall.git (Clean on main)"]
        ])

        # 2. AI Distillation & STT Hallucination Fixes
        add_heading("2. AI Distillation Engine & Speech-to-Text Rectification", level=1)
        add_heading("2.1 Root Cause of Biology Hallucinations in Math Videos", level=2)
        add_paragraph("During user testing, a critical bug was observed where mathematical lectures (specifically Maharashtra Board Class 12 Complex Numbers - Ram Maths) displayed biology laws ('Central Dogma of Molecular Biology') under the Scientific Laws & Principles section.")
        
        add_callout("Defect Root Cause Analysis", 
            "The offline heuristic synthesizer in backend/app/services/ai_service.py originally utilized an un-anchored regex pattern: (central dogma|dna|rna). "
            "In Indian and Hinglish mathematical lectures, spoken conversational words like 'karna', 'krna', and English terms like 'internal' matched the 'rna' substring. "
            "Furthermore, mathematical and scientific extraction routines were running simultaneously rather than enforcing mutual exclusion.")

        add_heading("2.2 Resolution & Domain Partitioning", level=2)
        add_bullet("Strict Word Boundaries:", "Updated all heuristic regular expressions with word boundary guards: \\b(central dogma|dna replication)\\b to prevent substring matching.")
        add_bullet("Mutual Exclusion Domain Isolation:", "Gated scientific principles strictly behind 'if is_science and not is_math:'. Mathematics videos can never trigger biology or physical science hypotheses.")
        add_bullet("Authentic Mathematical Law Extraction:", "Created dedicated mathematical principles including 'Modulo-4 Periodicity of Powers of i' and 'Consecutive Four-Term Zero Sum Rule' (sum of four consecutive powers of i equals zero).")
        add_bullet("Explicit Formula Derivations:", "Synthesized exact LaTeX expressions for the fundamental imaginary unit (i = sqrt(-1), i^2 = -1, i^3 = -i, i^4 = 1), modular exponent reduction theorem, and reciprocal identities (1/i = -i).")
        add_bullet("Model Prioritization:", "Promoted 'gemini-3.5-flash-lite' as the #1 candidate model in both backend and frontend clients. Live verification confirmed sub-second response times (<1s) on active Google AI Studio endpoints.")

        # 3. Standalone Desktop Application Window Architecture
        add_heading("3. Standalone Desktop Window Architecture", level=1)
        add_paragraph("In previous builds, executing the desktop launcher opened the web app in a standard web browser tab (Google Chrome or Microsoft Edge), leaving address bars, navigation controls, and browser tabs visible.")
        
        add_heading("3.1 Implementation in desktop_launcher.py", level=2)
        add_bullet("Native Window Subsystem:", "Integrated pywebview with WebView2 to render a dedicated, chromeless application window (1340x880, background #0a0a0c) with its own taskbar identity.")
        add_bullet("Microsoft Edge App Mode Fallback:", "If native WebView2 host libraries are not registered, launches Microsoft Edge in standalone App Mode (msedge.exe --app=http://localhost:8000) using an isolated user profile. This guarantees a native app appearance without address bars or tabs on Windows 10/11.")
        add_bullet("Windowed NoneType.isatty Bug Fix:", "Under PyInstaller's console=False mode, standard streams (sys.stdout, sys.stderr) are None. Created StreamToLogger with a dummy isatty() and passed log_config=None to uvicorn.Config to eliminate Uvicorn startup crashes.")
        add_bullet("Graceful Process Lifecycle:", "When the user closes the application window, the background Uvicorn daemon terminates cleanly.")

        # 4. Phase 1 Production Readiness & Security
        add_heading("4. Phase 1 Architecture & Production Hardening", level=1)
        add_bullet("JWT Authentication & Partitioning:", "Implemented secure user registration, login, and token verification (/api/auth/register, /api/auth/login, /api/auth/me) with bcrypt password hashing.")
        add_bullet("Zero Secret Leakage:", "Removed all hardcoded credentials from code files and parameterized them strictly through .env. Tested against GitHub push protection rules.")
        add_bullet("Multi-Format Export Pipeline:", "Developed full export services for Obsidian (Markdown with YAML frontmatter), Anki (AnkiConnect TSV format), and Notion.")

        # 5. Build Artifacts & System File Inventory
        add_heading("5. Build Artifacts & File Locations", level=1)
        add_table([
            ["Artifact / Component", "System Path & Details"],
            ["Windows Desktop EXE", "C:\\youtube recall solution\\dist\\YouTubeRecall.exe (33.7 MB)"],
            ["Android Mobile APK", "C:\\youtube recall solution\\dist\\youtube-recall.apk (4.88 MB)"],
            ["SQLite Database", "C:\\youtube recall solution\\dist\\recall.db (Multi-user persistence)"],
            ["Runtime Environment", "C:\\youtube recall solution\\dist\\.env (API keys & configuration)"],
            ["Desktop Launcher Source", "C:\\youtube recall solution\\desktop_launcher.py"],
            ["AI Synthesis Service", "C:\\youtube recall solution\\backend\\app\\services\\ai_service.py"],
            ["Client Frontend App", "C:\\youtube recall solution\\frontend\\app.js"],
            ["PyInstaller Packaging Spec", "C:\\youtube recall solution\\youtube_recall.spec"]
        ])

        # 6. Quality Assurance & Verification Results
        add_heading("6. Quality Assurance & Verification Results", level=1)
        add_bullet("Executable Health Check:", "Started dist/YouTubeRecall.exe in windowed mode and verified HTTP GET /api/health returned 200 OK ('healthy', free_tier_ready: true).")
        add_bullet("Log Verification:", "Verified dist/youtube_recall.log to confirm zero unhandled exceptions, zero NoneType errors, and clean server initialization.")
        add_bullet("Database Integrity Check:", "Inspected video #67 record in SQLite database to confirm authentic mathematical laws and zero biology terms.")
        add_bullet("Git Synchronization:", "All commits pushed and synced with origin/main on GitHub repository.")

        # Save document as DOCX (wdFormatDocumentDefault = 16)
        print(f"Saving native DOCX to: {docx_path}")
        doc.SaveAs(str(docx_path), 16)
        
        # Also copy to root workspace
        doc.SaveAs(str(root_docx_path), 16)
        print(f"Saving copy to: {root_docx_path}")

        # Also export as PDF (wdFormatPDF = 17)
        try:
            doc.SaveAs(str(pdf_path), 17)
            print(f"Exported matching PDF to: {pdf_path}")
        except Exception as pe:
            print(f"PDF export notice: {pe}")

        doc.Close()
        print("Document generated and saved successfully!")
    finally:
        word.Quit()

if __name__ == "__main__":
    create_native_word_report()
