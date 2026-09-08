// Original li4chess control icons. Decorative; every action retains a text label.
const paths = {
  play: "m8 5 11 7-11 7Z",
  save: "M5 3h12l4 4v14H3V3Zm2 0v7h10V3M7 21v-7h10v7",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  reset: "M3 10a9 9 0 1 1 2 8M3 3v7h7",
  flag: "M5 22V3c5-4 9 4 15 0v11c-6 4-10-4-15 0",
};
export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
