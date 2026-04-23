interface ConjugationTableProps {
  headers: string[];
  rows: string[][];
}

export function ConjugationTable({ headers, rows }: ConjugationTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="border-b-2 border-sumi/20 px-3 py-1.5 text-center font-bold text-xs"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-sumi/5">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-1.5 text-center ${
                    j === 0 ? "font-bold" : ""
                  } ${cell === "○" ? "text-sumi/20" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
