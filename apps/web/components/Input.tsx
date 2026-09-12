import type { ChangeEvent } from "react";


export const Input = ({ label, placeholder, onChange, type = "text" }: { label: string, placeholder: string, onChange: (e: ChangeEvent<HTMLInputElement>) => void, type?: "text" | "password" }) => {
    return <div>
        <div className="text-sm pt-2 pb-1">
            * <label>{ label }</label>
        </div>
        <input className="border rounded px-4 py-2 border-black w-full" type={type} placeholder={placeholder} onChange={onChange}></input>
    </div>
}
