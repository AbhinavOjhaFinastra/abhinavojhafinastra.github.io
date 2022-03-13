$(document).ready(function() {
    function htmlToCSV(closestTable, filename) {
    	let data = [];
    	let rows = closestTable.querySelectorAll("tr");

    	for (let i = 0; i < rows.length; i++) {
    		let row = [], cols = rows[i].querySelectorAll("td, th");

    		for (let j = 0; j < cols.length; j++) {
    		    if(cols[j].innerText !== "") {
                    row.push('"' + cols[j].innerText + '"');
                } else {
                    row.push(cols[j].innerText);
                }
            }

    		data.push(row.join(","));
    	}

        downloadCSVFile(data.join("\n"), filename);
    }

    function downloadCSVFile(csv, filename) {
    	let csv_file, download_link;

    	csv_file = new Blob([csv], {type: "text/csv"});

    	download_link = document.createElement("a");

    	download_link.download = filename;

    	download_link.href = window.URL.createObjectURL(csv_file);

    	download_link.style.display = "none";

    	document.body.appendChild(download_link);

    	download_link.click();
    }

    $(".html-csv-download").click(function () {
    	let closestTable = $(this).closest("div").find("table");
    	let fileName = $(this).attr('id') + ".csv";
    	htmlToCSV(closestTable.get(0), fileName);
    });
});