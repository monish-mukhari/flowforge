"use client";

import { ReactNode } from "react";

export const LinkButton = ({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) => {
  return (
    <div
      className=" flex justify-center px-2 py-2 text-sm font-light cursor-pointer hover:bg-slate-100 rounded"
      onClick={onClick}
    >
      {children}
    </div>
  );
};
