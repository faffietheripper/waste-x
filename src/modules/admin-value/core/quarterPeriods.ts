export type Quarter = 1 | 2 | 3 | 4;

export type QuarterPeriod = {
  year: number;
  quarter: Quarter;
  label: string;
  start: Date;
  endExclusive: Date;
  periodLabel: string;
};

export function isQuarter(value: number): value is Quarter {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function getCurrentQuarter(date = new Date()): Quarter {
  return (Math.floor(date.getUTCMonth() / 3) + 1) as Quarter;
}

export function getQuarterPeriod(year: number, quarter: Quarter): QuarterPeriod {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, startMonth + 3, 1, 0, 0, 0, 0));

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const endMonth = startMonth + 2;

  return {
    year,
    quarter,
    label: `Q${quarter} ${year}`,
    start,
    endExclusive,
    periodLabel: `${monthNames[startMonth]} to ${monthNames[endMonth]} ${year}`,
  };
}

export function getEnglandEaSubmissionWindow(period: QuarterPeriod) {
  const { year, quarter } = period;

  if (quarter === 1) {
    return {
      opens: new Date(Date.UTC(year, 3, 1)),
      closes: new Date(Date.UTC(year, 3, 30, 23, 59, 59, 999)),
      label: `1 to 30 April ${year}`,
    };
  }

  if (quarter === 2) {
    return {
      opens: new Date(Date.UTC(year, 6, 1)),
      closes: new Date(Date.UTC(year, 6, 31, 23, 59, 59, 999)),
      label: `1 to 31 July ${year}`,
    };
  }

  if (quarter === 3) {
    return {
      opens: new Date(Date.UTC(year, 9, 1)),
      closes: new Date(Date.UTC(year, 9, 31, 23, 59, 59, 999)),
      label: `1 to 31 October ${year}`,
    };
  }

  return {
    opens: new Date(Date.UTC(year + 1, 0, 1)),
    closes: new Date(Date.UTC(year + 1, 0, 31, 23, 59, 59, 999)),
    label: `1 to 31 January ${year + 1}`,
  };
}

export function parseQuarterSearchParams(params: {
  year?: string | string[];
  quarter?: string | string[];
}) {
  const currentDate = new Date();
  const rawYear = Array.isArray(params.year) ? params.year[0] : params.year;
  const rawQuarter = Array.isArray(params.quarter)
    ? params.quarter[0]
    : params.quarter;

  const parsedYear = Number(rawYear);
  const parsedQuarter = Number(rawQuarter);

  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : currentDate.getUTCFullYear();

  const quarter = isQuarter(parsedQuarter)
    ? parsedQuarter
    : getCurrentQuarter(currentDate);

  return getQuarterPeriod(year, quarter);
}

export function dateToInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}
