import { EnumLike } from "../structures"

export function enumToArray(x: EnumLike) {
    return Object.keys(x).filter((x) => isNaN(Number(x)))
}

export function resolveNumericEnum(en: EnumLike, value: string | number) {
    return typeof(value) === "string" ? en[value as keyof typeof en] : value
}