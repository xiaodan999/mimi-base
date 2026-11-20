export function getDateString(date: Date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function formatDate(dateStr: string) {
    const myDate = new Date(dateStr);
    return `${myDate.getFullYear()}/${
        myDate.getMonth() + 1
    }/${myDate.getDate()}  ${myDate.getHours()}:${myDate.getMinutes().toString().padStart(2, "0")}`;
}
