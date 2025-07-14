import React from "react";

interface ClickableTextProps {
  text: string;
  onActionClick: (action: string, type: string, param?: string) => void;
  className?: string;
}

export function ClickableText({
  text,
  onActionClick,
  className = "",
}: ClickableTextProps) {
  // Parse text for clickable links in format **[text](action:type:param)**
  const parseText = (text: string) => {
    console.log("🔍 ClickableText - Parsing text:", text);

    const parts: React.ReactNode[] = [];
    // More robust pattern that only matches valid action types (word characters)
    const linkPattern = /\*\*\[([^\]]+)\]\(action:(\w+)(?::([^)]+))?\)\*\*/g;
    let lastIndex = 0;
    let match;
    let matchCount = 0;

    // Reset regex lastIndex to ensure fresh parsing
    linkPattern.lastIndex = 0;

    while ((match = linkPattern.exec(text)) !== null) {
      matchCount++;
      const [fullMatch, linkText, actionType, actionParam] = match;
      const beforeText = text.slice(lastIndex, match.index);

      console.log(`🔍 Match ${matchCount}:`, {
        fullMatch,
        linkText,
        actionType,
        actionParam,
        beforeText:
          beforeText.substring(0, 50) + (beforeText.length > 50 ? "..." : ""),
        matchIndex: match.index,
        lastIndex,
        regexLastIndex: linkPattern.lastIndex,
      });

      // SAFETY CHECK: Prevent infinite loops
      if (linkPattern.lastIndex <= match.index) {
        console.error("🚨 Regex infinite loop detected! Breaking...");
        break;
      }

      // VALIDATION: Ensure clean action type
      if (
        !actionType ||
        actionType.includes(")") ||
        actionType.includes("*") ||
        actionType.includes("[")
      ) {
        console.error("🚨 Invalid action type detected:", actionType);
        console.error("🚨 Skipping malformed link");
        lastIndex = match.index + fullMatch.length;
        continue;
      }

      // Add text before the link
      if (beforeText) {
        parts.push(beforeText);
      }

      // Add the clickable link
      parts.push(
        <button
          key={`${match.index}-${matchCount}`}
          onClick={() => {
            console.log("🔗 Button clicked:", { actionType, actionParam });
            onActionClick(actionType, actionType, actionParam);
          }}
        >
          {linkText}
        </button>,
      );

      lastIndex = match.index + fullMatch.length;
    }

    console.log(`🔍 Found ${matchCount} clickable links`);

    // Add remaining text after the last link
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      console.log(
        "🔍 Remaining text:",
        remainingText.substring(0, 50) +
          (remainingText.length > 50 ? "..." : ""),
      );
      parts.push(remainingText);
    }

    return parts.length > 0 ? parts : [text];
  };

  const parsedElements = parseText(text);

  return (
    <div className={className}>
      {parsedElements.map((element, index) => (
        <React.Fragment key={index}>{element}</React.Fragment>
      ))}
    </div>
  );
}
