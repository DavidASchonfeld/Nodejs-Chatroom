	<?php
		$mysqli = new mysqli('localhost', 'module6user', 'module6pass', 'module6database');
		if($mysqli->connect_errno) {
		printf("Connection Failed: %s\n", $mysqli->connect_error);
		exit;
		}
	?>
