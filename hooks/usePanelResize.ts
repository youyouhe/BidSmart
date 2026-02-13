import { useState } from 'react';

export interface PanelResizeState {
  leftPanelWidth: number;
  setLeftPanelWidth: (w: number) => void;
  rightPanelWidth: number;
  setRightPanelWidth: (w: number) => void;
  isResizingLeft: boolean;
  setIsResizingLeft: (v: boolean) => void;
  isResizingRight: boolean;
  setIsResizingRight: (v: boolean) => void;
  bidLeftPanelWidth: number;
  setBidLeftPanelWidth: (w: number) => void;
  bidRightPanelWidth: number;
  setBidRightPanelWidth: (w: number) => void;
  isResizingBidLeft: boolean;
  setIsResizingBidLeft: (v: boolean) => void;
  isResizingBidRight: boolean;
  setIsResizingBidRight: (v: boolean) => void;
}

export function usePanelResize(): PanelResizeState {
  const [leftPanelWidth, setLeftPanelWidth] = useState(380);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const [bidLeftPanelWidth, setBidLeftPanelWidth] = useState(380);
  const [bidRightPanelWidth, setBidRightPanelWidth] = useState(320);
  const [isResizingBidLeft, setIsResizingBidLeft] = useState(false);
  const [isResizingBidRight, setIsResizingBidRight] = useState(false);

  return {
    leftPanelWidth, setLeftPanelWidth,
    rightPanelWidth, setRightPanelWidth,
    isResizingLeft, setIsResizingLeft,
    isResizingRight, setIsResizingRight,
    bidLeftPanelWidth, setBidLeftPanelWidth,
    bidRightPanelWidth, setBidRightPanelWidth,
    isResizingBidLeft, setIsResizingBidLeft,
    isResizingBidRight, setIsResizingBidRight,
  };
}
