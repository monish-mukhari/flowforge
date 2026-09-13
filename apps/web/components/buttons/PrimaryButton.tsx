import { ReactNode } from "react";

export const PrimaryButton = ({
  children,
  onClick,
  size = "small",
}: {
  children: ReactNode;
  onClick: () => void;
  size?: "big" | "small";
}) => {
  return (
    <div
      onClick={onClick}
      className={`${size === "small" ? "text-sm" : "text-xl"} ${size === "small" ? "px-8 py-2" : "px-16 py-3"} bg-amber-700 text-white cursor-pointer rounded-full hover:shadow-md text-center flex flex-col justify-center`}
    >
      {children}
    </div>
  );
};
