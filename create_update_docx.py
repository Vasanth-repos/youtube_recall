import os
import zipfile
import html
from pathlib import Path
from datetime import datetime

output_docx_path = Path("dist/YouTube_Recall_Complete_Updates.docx")
output_docx_path.parent.mkdir(parents=True, exist_ok=True)

# XML templates for a professional DOCX
content_types_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"""

root_rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

doc_rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:color w:val="2D3748"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="160" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr>
      <w:spacing w:before="240" w:after="120"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:b/>
      <w:sz w:val="48"/>
      <w:color w:val="1A365D"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:pPr>
      <w:spacing w:before="0" w:after="300"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:i/>
      <w:sz w:val="26"/>
      <w:color w:val="4A5568"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:pPr>
      <w:spacing w:before="360" w:after="140"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:b/>
      <w:sz w:val="34"/>
      <w:color w:val="2B6CB0"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:pPr>
      <w:spacing w:before="240" w:after="100"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:b/>
      <w:sz w:val="28"/>
      <w:color w:val="2D3748"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="Heading 3"/>
    <w:pPr>
      <w:spacing w:before="180" w:after="80"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:b/>
      <w:sz w:val="24"/>
      <w:color w:val="4A5568"/>
    </w:rPr>
  </w:style>
</w:styles>"""

class DocxBuilder:
    def __init__(self):
        self.paragraphs = []

    def p(self, text, bold=False, italic=False, color="2D3748", size=22, space_after=160):
        t_clean = html.escape(text)
        b_tag = "<w:b/>" if bold else ""
        i_tag = "<w:i/>" if italic else ""
        xml = f"""<w:p>
  <w:pPr>
    <w:spacing w:after="{space_after}" w:line="276" w:lineRule="auto"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      {b_tag}{i_tag}
      <w:color w:val="{color}"/>
      <w:sz w:val="{size}"/>
    </w:rPr>
    <w:t xml:space="preserve">{t_clean}</w:t>
  </w:r>
</w:p>"""
        self.paragraphs.append(xml)

    def heading(self, text, level=1):
        t_clean = html.escape(text)
        sizes = {1: (34, "2B6CB0", 360, 140), 2: (28, "1A202C", 240, 100), 3: (24, "4A5568", 180, 80)}
        sz, col, before, after = sizes.get(level, (24, "4A5568", 180, 80))
        xml = f"""<w:p>
  <w:pPr>
    <w:pStyle w:val="Heading{level}"/>
    <w:spacing w:before="{before}" w:after="{after}"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:b/>
      <w:color w:val="{col}"/>
      <w:sz w:val="{sz}"/>
    </w:rPr>
    <w:t xml:space="preserve">{t_clean}</w:t>
  </w:r>
</w:p>"""
        self.paragraphs.append(xml)

    def bullet(self, bold_prefix, text):
        bp = html.escape(bold_prefix)
        t = html.escape(text)
        xml = f"""<w:p>
  <w:pPr>
    <w:pStyle w:val="ListParagraph"/>
    <w:spacing w:after="100"/>
    <w:ind w:left="480" w:hanging="240"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:color w:val="2B6CB0"/>
      <w:sz w:val="22"/>
    </w:rPr>
    <w:t>• </w:t>
  </w:r>
  <w:r>
    <w:rPr>
      <w:b/>
      <w:color w:val="1A202C"/>
      <w:sz w:val="22"/>
    </w:rPr>
    <w:t xml:space="preserve">{bp} </w:t>
  </w:r>
  <w:r>
    <w:rPr>
      <w:color w:val="4A5568"/>
      <w:sz w:val="22"/>
    </w:rPr>
    <w:t xml:space="preserve">{t}</w:t>
  </w:r>
</w:p>"""
        self.paragraphs.append(xml)

    def callout(self, title, content):
        t_clean = html.escape(title)
        c_clean = html.escape(content)
        xml = f"""<w:p>
  <w:pPr>
    <w:pBdr>
      <w:left w:val="single" w:sz="36" w:space="15" w:color="3182CE"/>
    </w:pPr>
    <w:shd w:val="clear" w:color="auto" w:fill="EDF2F7"/>
    <w:spacing w:before="140" w:after="140"/>
    <w:ind w:left="300" w:right="300"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:b/>
      <w:color w:val="2B6CB0"/>
      <w:sz w:val="22"/>
    </w:rPr>
    <w:t xml:space="preserve">{t_clean}: </w:t>
  </w:r>
  <w:r>
    <w:rPr>
      <w:color w:val="2D3748"/>
      <w:sz w:val="22"/>
    </w:rPr>
    <w:t xml:space="preserve">{c_clean}</w:t>
  </w:r>
</w:p>"""
        self.paragraphs.append(xml)

    def table_2col(self, rows):
        # Generates a clean 2-column key-value table
        tr_xmls = []
        for col1, col2, is_header in rows:
            c1 = html.escape(col1)
            c2 = html.escape(col2)
            bg = ' w:fill="2B6CB0"' if is_header else (' w:fill="F7FAFC"' if len(tr_xmls) % 2 == 1 else '')
            txt_col1 = 'FFFFFF' if is_header else '1A202C'
            txt_col2 = 'FFFFFF' if is_header else '4A5568'
            b_tag = '<w:b/>' if is_header else ''

            tr = f"""<w:tr>
  <w:tc>
    <w:tcPr>
      <w:tcW w:w="3200" w:type="dxa"/>
      <w:shd w:val="clear" w:color="auto"{bg}/>
      <w:tcMar><w:top w:w="120"/><w:bottom w:w="120"/><w:left w:w="180"/><w:right w:w="180"/></w:tcMar>
    </w:tcPr>
    <w:p><w:r><w:rPr>{b_tag}<w:color w:val="{txt_col1}"/><w:sz w:val="20"/></w:rPr><w:t>{c1}</w:t></w:r></w:p>
  </w:tc>
  <w:tc>
    <w:tcPr>
      <w:tcW w:w="6000" w:type="dxa"/>
      <w:shd w:val="clear" w:color="auto"{bg}/>
      <w:tcMar><w:top w:w="120"/><w:bottom w:w="120"/><w:left w:w="180"/><w:right w:w="180"/></w:tcMar>
    </w:tcPr>
    <w:p><w:r><w:rPr>{b_tag}<w:color w:val="{txt_col2}"/><w:sz w:val="20"/></w:rPr><w:t>{c2}</w:t></w:r></w:p>
  </w:tc>
</w:tr>"""
            tr_xmls.append(tr)

        all_trs = "".join(tr_xmls)
        tbl = f"""<w:tbl>
  <w:tblPr>
    <w:tblW w:w="9200" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E0"/>
      <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E0"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
      <w:insideV w:val="none"/>
    </w:tblBorders>
  </w:tblPr>
  {all_trs}
</w:tbl>
<w:p><w:spacing w:after="160"/></w:p>"""
        self.paragraphs.append(tbl)

    def render_document(self):
        body_content = "".join(self.paragraphs)
        return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {body_content}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>"""

b = DocxBuilder()

# Document Header & Title
b.p("YOUTUBE RECALL & SPACED REPETITION ENGINE", bold=True, color="1A365D", size=36, space_after=60)
b.p("Complete Engineering Updates, Architectural Implementation & Release Report", italic=True, color="4A5568", size=24, space_after=200)
b.p(f"Generated: {datetime.now().strftime('%B %d, %Y')} | Status: Production Verified | Version: 2.0.0", bold=True, color="718096", size=18, space_after=300)

# Section 1: Executive Summary
b.heading("1. Executive Summary", level=1)
b.p("This document provides an exhaustive record of all system enhancements, bug fixes, user interface modernizations, and cross-platform compilation deliverables implemented for the YouTube Recall & Spaced Repetition platform.")
b.p("The platform transforms long-form academic and instructional YouTube videos into high-yield 5-minute micro-learning cheat sheets, mathematical formula derivations, conceptual invariants, and SuperMemo SM-2 spaced repetition flashcards.")

b.table_2col([
    ("Deliverable Component", "Specification & Deployment Status", True),
    ("Standalone Windows App", "dist/YouTubeRecall.exe (33.7 MB) - Standalone native window (no browser tabs)", False),
    ("Android Mobile APK", "dist/youtube-recall.apk (4.88 MB) - Client-side on-device distillation engine", False),
    ("AI Distillation Pipeline", "Google Gemini 3.5 Flash Lite priority, Groq Llama-3.3 fallback, Offline Synthesizer", False),
    ("Spaced Repetition Algorithm", "SM-2 Interval Scheduling (0, 1, 3, 7, 15, 30, 60, 90, 180 days)", False),
    ("Database Engine", "SQLite persistent storage (recall.db) with migration schemas", False),
    ("Source Control", "https://github.com/Vasanth-repos/youtube_recall.git (Branch: main)", False)
])

# Section 2: Bug Fixes & AI Noise Elimination
b.heading("2. AI Distillation & Speech-to-Text Correction", level=1)
b.heading("2.1 Root Cause of Biology Hallucination in Math Videos", level=2)
b.p("A critical issue was identified where mathematical lecture videos (e.g. Class 12 Complex Numbers - Ram Maths) displayed false-positive biology laws ('Central Dogma of Molecular Biology') under the Scientific Laws section.")
b.callout("Defect Root Cause", "In backend/app/services/ai_service.py, the heuristic offline synthesizer used an un-anchored regex pattern: (central dogma|dna|rna). In Indian/Hinglish mathematics lectures, common conversational words like 'karna', 'krna', or English words like 'internal' matched the substring 'rna'. Because domain checks were run simultaneously without mutual exclusion, this biology law was erroneously emitted.")

b.heading("2.2 Comprehensive Resolution & Domain Partitioning", level=2)
b.bullet("Strict Regex Word Boundaries:", "Updated all heuristic regex rules to enforce word boundaries: \\b(central dogma|dna replication)\\b.")
b.bullet("Domain Isolation:", "Partitioned extraction so biology and physical science principles are strictly gated behind 'if is_science and not is_math:'. Math videos can never trigger biology hypotheses.")
b.bullet("Complex Numbers Mathematics Principles:", "Added authentic mathematical laws including 'Modulo-4 Periodicity of Powers of i' (i^(4k+r) = i^r) and 'Consecutive Four-Term Zero Sum Rule' (sum_{k=m}^{m+3} i^k = 0).")
b.bullet("Formula Derivation Extraction:", "Synthesized explicit formulas for the imaginary unit (i = sqrt(-1), i^2 = -1, i^3 = -i, i^4 = 1), modular reduction theorem, reciprocal identity (1/i = -i), and arithmetic progression exponent summations.")
b.bullet("Database Rectification:", "Updated database records for affected video entries in both backend/recall.db and dist/recall.db.")

# Section 3: Standalone Desktop Window Architecture
b.heading("3. Standalone Desktop Window Architecture", level=1)
b.p("Previously, the desktop launcher opened the web application in a standard external web browser tab (Chrome/Edge/Firefox), exposing the browser URL bar, navigation controls, and unrelated tabs.")
b.heading("3.1 Implementation in desktop_launcher.py", level=2)
b.p("The desktop launcher was redesigned into a native desktop application window:")
b.bullet("Native WebView2 Frame:", "Uses pywebview to render a chromeless, dedicated window (1340x880, background #0a0a0c) with its own taskbar identity.")
b.bullet("Edge Standalone App Mode Fallback:", "If native WebView2 binaries are not registered, launches Microsoft Edge in standalone App Mode (msedge.exe --app=http://localhost:8000) using an isolated user profile. This renders the application without any browser URL bar or navigation tabs.")
b.bullet("Windowed Headless Subsystem Fix:", "Under PyInstaller's console=False mode, standard streams (sys.stdout, sys.stderr) are None. Created StreamToLogger with dummy isatty() and passed log_config=None to uvicorn.Config to prevent crashes.")
b.bullet("Clean Process Lifecycle:", "When the user closes the application window, the background Uvicorn daemon terminates gracefully.")

# Section 4: Phase 1 Production Readiness & Security
b.heading("4. Phase 1 Architecture & Production Hardening", level=1)
b.bullet("Authentication & User Partitioning:", "Implemented JWT-based authentication (/api/auth/register, /api/auth/login, /api/auth/me) with bcrypt password hashing.")
b.bullet("Secret Protection:", "All API keys and credentials removed from source files and parameterized through .env files. Protected against accidental GitHub secret leaks.")
b.bullet("Model Prioritization:", "Promoted gemini-3.5-flash-lite as the primary high-speed candidate model across backend and frontend, achieving sub-second distillation responses.")
b.bullet("Export Integrations:", "Full export pipeline implemented for Obsidian (clean Markdown with YAML frontmatter), Anki (AnkiConnect TSV/deck format), and Notion.")

# Section 5: Cross-Platform Packaging & File Inventory
b.heading("5. Build Artifacts & File Locations", level=1)
b.table_2col([
    ("Artifact", "Absolute System Location", True),
    ("Windows Desktop EXE", "C:\\youtube recall solution\\dist\\YouTubeRecall.exe", False),
    ("Android Mobile APK", "C:\\youtube recall solution\\dist\\youtube-recall.apk", False),
    ("Embedded SQLite DB", "C:\\youtube recall solution\\dist\\recall.db", False),
    ("Runtime Environment Config", "C:\\youtube recall solution\\dist\\.env", False),
    ("Desktop Launcher Source", "C:\\youtube recall solution\\desktop_launcher.py", False),
    ("AI Service Engine", "C:\\youtube recall solution\\backend\\app\\services\\ai_service.py", False),
    ("Client Frontend App", "C:\\youtube recall solution\\frontend\\app.js", False),
    ("PyInstaller Spec", "C:\\youtube recall solution\\youtube_recall.spec", False)
])

# Section 6: Verification & Quality Assurance
b.heading("6. Verification & Quality Assurance", level=1)
b.p("The deliverables underwent end-to-end testing and verification:")
b.bullet("Executable Health Check:", "Started dist/YouTubeRecall.exe and verified HTTP GET /api/health returned 200 OK ('healthy', free_tier_ready: true).")
b.bullet("Log Verification:", "Inspected dist/youtube_recall.log to confirm zero unhandled exceptions, zero NoneType errors, and clean server initialization.")
b.bullet("Database Integrity:", "Queried video record #67 to confirm pure mathematical identities and verify the complete absence of biology terms.")
b.bullet("Git Repository Synchronization:", "All commits cleanly pushed to main branch on GitHub (commits e7ea430 and a075fe0).")

# Write out the DOCX file
with zipfile.ZipFile(output_docx_path, "w", zipfile.ZIP_DEFLATED) as docx:
    docx.writestr("[Content_Types].xml", content_types_xml)
    docx.writestr("_rels/.rels", root_rels_xml)
    docx.writestr("word/_rels/document.xml.rels", doc_rels_xml)
    docx.writestr("word/styles.xml", styles_xml)
    docx.writestr("word/document.xml", b.render_document())

print(f"Successfully generated DOCX at: {output_docx_path.resolve()}")
print(f"File size: {output_docx_path.stat().st_size} bytes")
