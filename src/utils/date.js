export function getDateString(date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getMonthRange(month) {
  const year = new Date().getFullYear()
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 1)
  return [getDateString(startDate), getDateString(endDate)]
}

export function getCurrentMonth() {
  const date = new Date()
  const month = date.getMonth() + 1

  return month
}
