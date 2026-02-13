/**
 * Frontend Word document export utility.
 *
 * Converts a TenderProject (with Markdown section content) into a .docx Blob
 * entirely in the browser — no backend dependency.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  convertMillimetersToTwip,
  LevelFormat,
  TableOfContents,
} from 'docx';
import type { TenderProject, ExportConfig } from '../types';

// ─── Style constants ────────────────────────────────────────────────────────

const FONT_BODY = '仿宋';
const FONT_HEADING = '黑体';
const FONT_SIZE_BODY = 22;        // half-points → 11pt
const FONT_SIZE_H1 = 32;          // 16pt
const FONT_SIZE_H2 = 28;          // 14pt
const FONT_SIZE_H3 = 24;          // 12pt
const FONT_SIZE_H4 = 22;          // 11pt
const FONT_SIZE_TABLE = 20;       // 10pt
const LINE_SPACING = 360;         // 1.5x line spacing (240 * 1.5)
const FIRST_LINE_INDENT = convertMillimetersToTwip(7); // ~2 Chinese chars

// ─── Inline Markdown parsing ────────────────────────────────────────────────

interface InlineSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/**
 * Parse inline markdown: **bold**, *italic*, ***bold+italic***
 * Returns an array of segments with formatting flags.
 */
function parseInlineMarkdown(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  // Regex matches: ***bold+italic***, **bold**, *italic*, or plain text
  const regex = /(\*{3})(.*?)\1|(\*{2})(.*?)\3|(\*)(.*?)\5/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Push plain text before this match
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }

    if (match[1] === '***') {
      segments.push({ text: match[2], bold: true, italic: true });
    } else if (match[3] === '**') {
      segments.push({ text: match[4], bold: true });
    } else if (match[5] === '*') {
      segments.push({ text: match[6], italic: true });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ text });
  }

  return segments;
}

/**
 * Convert inline segments to docx TextRun objects.
 */
function toTextRuns(
  text: string,
  baseFontSize: number = FONT_SIZE_BODY,
  baseFont: string = FONT_BODY,
  baseBold?: boolean,
  baseItalic?: boolean,
  baseColor?: string,
): TextRun[] {
  const segments = parseInlineMarkdown(text);
  return segments.map(seg => new TextRun({
    text: seg.text,
    font: baseFont,
    size: baseFontSize,
    bold: baseBold || seg.bold,
    italics: baseItalic || seg.italic,
    color: baseColor,
  }));
}

// ─── Line-level Markdown parsing ────────────────────────────────────────────

type LineType =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'bullet'; text: string; indent: number }
  | { type: 'numbered'; text: string; indent: number }
  | { type: 'table_row'; cells: string[]; isHeader: boolean }
  | { type: 'table_separator' }
  | { type: 'code_fence'; lang: string }
  | { type: 'code_line'; text: string }
  | { type: 'empty' }
  | { type: 'paragraph'; text: string };

function classifyLine(line: string, inCodeBlock: boolean): LineType {
  if (inCodeBlock) {
    if (/^```/.test(line)) return { type: 'code_fence', lang: '' };
    return { type: 'code_line', text: line };
  }

  // Code fence start
  const fenceMatch = line.match(/^```(\w*)/);
  if (fenceMatch) return { type: 'code_fence', lang: fenceMatch[1] || '' };

  // Empty line
  if (line.trim() === '') return { type: 'empty' };

  // Headings
  const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
  if (headingMatch) {
    const level = headingMatch[1].length as 1 | 2 | 3 | 4;
    return { type: 'heading', level, text: headingMatch[2] };
  }

  // Table separator
  if (/^\|?\s*[-:]+[-|\s:]*$/.test(line)) return { type: 'table_separator' };

  // Table row
  if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
    const cells = line.trim().slice(1, -1).split('|').map(c => c.trim());
    return { type: 'table_row', cells, isHeader: false };
  }

  // Unordered list
  const bulletMatch = line.match(/^(\s*)[*\-+]\s+(.+)/);
  if (bulletMatch) {
    const indent = Math.floor(bulletMatch[1].length / 2);
    return { type: 'bullet', text: bulletMatch[2], indent };
  }

  // Ordered list
  const numberedMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
  if (numberedMatch) {
    const indent = Math.floor(numberedMatch[1].length / 2);
    return { type: 'numbered', text: numberedMatch[2], indent };
  }

  return { type: 'paragraph', text: line };
}

// ─── Table builder ──────────────────────────────────────────────────────────

function buildTable(rows: { cells: string[]; isHeader: boolean }[]): Table {
  const colCount = Math.max(...rows.map(r => r.cells.length));
  const colWidthPct = Math.floor(100 / colCount);

  const tableRows = rows.map(row => {
    const cells: TableCell[] = [];
    for (let i = 0; i < colCount; i++) {
      const cellText = row.cells[i] || '';
      cells.push(new TableCell({
        width: { size: colWidthPct, type: WidthType.PERCENTAGE },
        shading: row.isHeader
          ? { type: ShadingType.SOLID, color: 'F3F4F6', fill: 'F3F4F6' }
          : undefined,
        children: [new Paragraph({
          children: toTextRuns(cellText, FONT_SIZE_TABLE, FONT_BODY, row.isHeader),
        })],
      }));
    }
    return new TableRow({ children: cells });
  });

  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
    },
  });
}

// ─── Markdown → docx elements ───────────────────────────────────────────────

function markdownToDocxElements(content: string): (Paragraph | Table)[] {
  const lines = content.split('\n');
  const elements: (Paragraph | Table)[] = [];

  let inCodeBlock = false;
  let codeLang = '';
  let pendingTableRows: { cells: string[]; isHeader: boolean }[] = [];

  const flushTable = () => {
    if (pendingTableRows.length > 0) {
      elements.push(buildTable(pendingTableRows));
      pendingTableRows = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const classified = classifyLine(lines[i], inCodeBlock);

    // Flush table if current line is not table-related
    if (classified.type !== 'table_row' && classified.type !== 'table_separator') {
      flushTable();
    }

    switch (classified.type) {
      case 'heading': {
        const headingLevelMap: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
          1: HeadingLevel.HEADING_1,
          2: HeadingLevel.HEADING_2,
          3: HeadingLevel.HEADING_3,
          4: HeadingLevel.HEADING_4,
        };
        const fontSizeMap: Record<number, number> = {
          1: FONT_SIZE_H1,
          2: FONT_SIZE_H2,
          3: FONT_SIZE_H3,
          4: FONT_SIZE_H4,
        };
        elements.push(new Paragraph({
          heading: headingLevelMap[classified.level],
          children: toTextRuns(classified.text, fontSizeMap[classified.level], FONT_HEADING, true),
          spacing: { before: 240, after: 120 },
        }));
        break;
      }

      case 'bullet': {
        elements.push(new Paragraph({
          bullet: { level: classified.indent },
          children: toTextRuns(classified.text),
          spacing: { before: 40, after: 40 },
        }));
        break;
      }

      case 'numbered': {
        elements.push(new Paragraph({
          numbering: { reference: 'default-numbering', level: classified.indent },
          children: toTextRuns(classified.text),
          spacing: { before: 40, after: 40 },
        }));
        break;
      }

      case 'table_row': {
        // If this is the first row after nothing, mark it as header
        if (pendingTableRows.length === 0) {
          classified.isHeader = true;
        }
        pendingTableRows.push({ cells: classified.cells, isHeader: classified.isHeader });
        break;
      }

      case 'table_separator': {
        // Mark the first accumulated row as header
        if (pendingTableRows.length > 0) {
          pendingTableRows[0].isHeader = true;
        }
        break;
      }

      case 'code_fence': {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLang = classified.lang;
          // If mermaid, we'll collect and skip
        } else {
          // End of code block
          if (codeLang === 'mermaid') {
            elements.push(new Paragraph({
              children: [new TextRun({
                text: '[图表请参见在线版本]',
                font: FONT_BODY,
                size: FONT_SIZE_BODY,
                italics: true,
                color: 'AAAAAA',
              })],
              spacing: { before: 120, after: 120 },
              alignment: AlignmentType.CENTER,
            }));
          }
          inCodeBlock = false;
          codeLang = '';
        }
        break;
      }

      case 'code_line': {
        // Skip mermaid code lines, show other code as plain text
        if (codeLang !== 'mermaid') {
          elements.push(new Paragraph({
            children: [new TextRun({
              text: classified.text,
              font: 'Courier New',
              size: FONT_SIZE_TABLE,
            })],
            spacing: { before: 20, after: 20 },
          }));
        }
        break;
      }

      case 'empty': {
        elements.push(new Paragraph({ children: [] }));
        break;
      }

      case 'paragraph': {
        elements.push(new Paragraph({
          children: toTextRuns(classified.text),
          spacing: { before: 60, after: 60, line: LINE_SPACING },
          indent: { firstLine: FIRST_LINE_INDENT },
        }));
        break;
      }
    }
  }

  // Flush any remaining table
  flushTable();

  return elements;
}

// ─── Document assembly ──────────────────────────────────────────────────────

export async function generateWordDocument(
  project: TenderProject,
  config: ExportConfig,
): Promise<Blob> {
  const sortedSections = [...project.sections].sort((a, b) => a.order - b.order);

  // ── Cover page ──────────────────────────────────────────────────────────
  const coverChildren: Paragraph[] = [
    new Paragraph({ children: [] }),
    new Paragraph({ children: [] }),
    new Paragraph({ children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: project.title,
        font: FONT_HEADING,
        size: 44, // 22pt
        bold: true,
      })],
      spacing: { after: 400 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: new Date(project.createdAt).toLocaleDateString('zh-CN', {
          year: 'numeric', month: 'long', day: 'numeric',
        }),
        font: FONT_BODY,
        size: 24, // 12pt
        color: '808080',
      })],
    }),
    new Paragraph({
      children: [new PageBreak()],
    }),
  ];

  // ── Table of Contents (outline) ─────────────────────────────────────────
  const tocChildren: Paragraph[] = [];
  if (config.includeOutline) {
    tocChildren.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: '目录', font: FONT_HEADING, size: FONT_SIZE_H1, bold: true })],
      spacing: { after: 240 },
    }));

    sortedSections.forEach((section, idx) => {
      const isCompleted = section.status === 'completed';
      tocChildren.push(new Paragraph({
        children: [new TextRun({
          text: `${idx + 1}. ${section.title}`,
          font: FONT_BODY,
          size: FONT_SIZE_BODY,
          color: isCompleted ? '000000' : 'B4B4B4',
        })],
        spacing: { after: 80 },
      }));
    });

    tocChildren.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // ── Section content ─────────────────────────────────────────────────────
  const sectionChildren: (Paragraph | Table)[] = [];

  sortedSections.forEach((section, idx) => {
    // Section heading
    sectionChildren.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({
        text: `${idx + 1}. ${section.title}`,
        font: FONT_HEADING,
        size: FONT_SIZE_H1,
        bold: true,
      })],
      spacing: { before: 360, after: 200 },
    }));

    // Requirement summary
    if (config.includeRequirements && section.summary) {
      sectionChildren.push(new Paragraph({
        children: [new TextRun({
          text: `【招标要求摘要】${section.summary}`,
          font: FONT_BODY,
          size: 18, // 9pt
          italics: true,
          color: '646464',
        })],
        spacing: { after: 160 },
      }));
    }

    // Content
    if (section.content.trim()) {
      const contentElements = markdownToDocxElements(section.content);
      sectionChildren.push(...contentElements);
    } else {
      sectionChildren.push(new Paragraph({
        children: [new TextRun({
          text: '（此章节尚未编写）',
          font: FONT_BODY,
          size: FONT_SIZE_BODY,
          italics: true,
          color: 'B4B4B4',
        })],
      }));
    }
  });

  // ── Assemble document ───────────────────────────────────────────────────
  const doc = new Document({
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.START,
        }, {
          level: 1,
          format: LevelFormat.DECIMAL,
          text: '%1.%2.',
          alignment: AlignmentType.START,
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertMillimetersToTwip(25),
            bottom: convertMillimetersToTwip(25),
            left: convertMillimetersToTwip(30),
            right: convertMillimetersToTwip(25),
          },
        },
      },
      children: [
        ...coverChildren,
        ...tocChildren,
        ...sectionChildren,
      ],
    }],
  });

  return Packer.toBlob(doc);
}
