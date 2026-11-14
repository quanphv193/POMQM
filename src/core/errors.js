// A data problem the user can fix. `row` is the 0-based data row in the input table, `col` the 0-based column.
export class InputError extends Error {
	constructor(message, row = null, col = null) {
		super(message);
		this.name = 'InputError';
		this.row = row;
		this.col = col;
	}
}
